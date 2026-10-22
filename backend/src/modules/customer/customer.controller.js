/**
 * customer.controller.js
 * ──────────────────────
 * Customer (mobile app) account endpoints: registration, OTP verification,
 * login, profile and the notification feed.
 *
 * The staff/rider account flow lives in ../auth/auth.controller.js and is kept
 * separate: a customer JWT carries `type: 'customer'` and must never be able
 * to reach a staff table, and vice versa.
 *
 * Response shape follows what the app parses (see lib/services/api_service.dart):
 *   AuthResponse  → { accessToken, refreshToken, user: { id, email,
 *                     email_verified, profile_completed, status,
 *                     first_name, last_name } }
 *   CustomerProfile → { id, email, first_name, last_name, mobile_number,
 *                       address, latitude, longitude, profile_completed,
 *                       restriction_level, has_saved_payment,
 *                       saved_payment_last4, saved_payment_type }
 */

const bcrypt = require('bcrypt');
const db = require('../../config/db');
const { storeOtp, verifyOtp: verifyOtpCode, sendOtpEmail } = require('../auth/auth.otp');
const { signAccessToken, signRefreshToken } = require('../auth/auth.jwt');

const BCRYPT_ROUNDS = 12;
// A normal address: local-part @ domain . tld  (e.g. "name@example.com")
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** The customer shape the app expects inside `user`. */
function publicUser(row) {
  return {
    id: row.id,
    type: 'customer',
    email: row.email,
    email_verified: row.email_verified ?? false,
    profile_completed: row.profile_completed ?? false,
    status: row.status ?? 'awaiting_verification',
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
  };
}

/**
 * Normalize a mobile number to the 11 characters the column allows.
 * '+63 917 123 4567' → '09171234567'.
 */
function normalizeMobile(value) {
  if (value === undefined || value === null) return undefined;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `0${digits}`;
  if (digits.length === 12 && digits.startsWith('63')) return `0${digits.slice(2)}`;
  if (digits.length === 11) return digits;
  return digits.slice(-11);
}

/** Restriction level for a customer ('none' when no row exists). */
async function restrictionLevel(customerId) {
  const { rows } = await db.query(
    'SELECT restriction_level FROM customer_restrictions WHERE customer_id = $1',
    [customerId]
  );
  return rows[0]?.restriction_level || 'none';
}

/** The profile payload both GET and PUT /api/customer/profile return. */
async function buildProfile(row) {
  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    mobile_number: row.mobile_number ?? null,
    address: row.address ?? null,
    latitude: row.latitude !== null && row.latitude !== undefined ? parseFloat(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? parseFloat(row.longitude) : null,
    profile_completed: row.profile_completed ?? false,
    status: row.status ?? 'awaiting_verification',
    email_verified: row.email_verified ?? false,
    restriction_level: await restrictionLevel(row.id),
    // No saved-card table exists yet — the app renders the section from these
    // two flags, so they are the contract, not the storage.
    has_saved_payment: false,
    saved_payment_last4: null,
    saved_payment_type: null,
  };
}

// ─── POST /api/auth/customer/register ────────────────────────────────────────
/**
 * Body: { email, password }
 *
 * Creates the customer row in 'awaiting_verification' state and mails a
 * 6-digit code. The row exists before verification so the response can carry
 * the customer id (the app requires a non-null `user`), and so the code can be
 * re-sent for the same address. A password is only ever accepted over the
 * hashed column — the plaintext is never stored or logged.
 */
async function register(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { rows: existingRows } = await db.query(
      'SELECT id, email_verified FROM customers WHERE email = $1',
      [normalizedEmail]
    );

    if (existingRows.length > 0 && existingRows[0].email_verified) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let customer;
    if (existingRows.length > 0) {
      // Unverified account — allow a retry with a new password.
      const { rows } = await db.query(
        `UPDATE customers
            SET password_hash = $1,
                status        = 'awaiting_verification',
                email_verified = FALSE,
                updated_at    = NOW()
          WHERE id = $2
          RETURNING *`,
        [passwordHash, existingRows[0].id]
      );
      customer = rows[0];
    } else {
      const { rows } = await db.query(
        `INSERT INTO customers (email, password_hash, status, email_verified)
         VALUES ($1, $2, 'awaiting_verification', FALSE)
         RETURNING *`,
        [normalizedEmail, passwordHash]
      );
      customer = rows[0];
    }

    const otp = await storeOtp(normalizedEmail, 'email_verification');

    // Detached: the response must not wait on SMTP.
    sendOtpEmail(normalizedEmail, otp, 'email_verification').catch((err) =>
      console.error('[customerRegister] OTP email failed:', err.message)
    );

    return res.status(201).json({
      message: 'Account created. Check your email for the verification code.',
      user: publicUser(customer),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/customer/verify-otp ──────────────────────────────────────
/**
 * Body: { email, otp, purpose }
 *   purpose = 'email_verification' → marks the account active, returns tokens
 *   purpose = 'password_reset'     → only checks the code, returns a message
 */
async function verifyOtp(req, res, next) {
  try {
    const { email, otp, purpose = 'email_verification' } = req.body || {};

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and code are required.' });
    }
    if (!['email_verification', 'password_reset'].includes(purpose)) {
      return res.status(400).json({ message: 'Unsupported verification purpose.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const result = await verifyOtpCode(normalizedEmail, String(otp), purpose);

    if (!result.valid) {
      if (result.reason === 'expired') {
        return res.status(400).json({ message: 'That code has expired. Request a new one.' });
      }
      return res.status(400).json({ message: 'Invalid code. Please try again.' });
    }

    if (purpose === 'password_reset') {
      return res.status(200).json({
        message: 'Code verified. You can now set a new password.',
      });
    }

    const { rows } = await db.query(
      `UPDATE customers
          SET email_verified = TRUE,
              status          = 'active',
              updated_at      = NOW()
        WHERE email = $1
        RETURNING *`,
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No account found with that email.' });
    }

    const customer = rows[0];
    const payload = { sub: customer.id, type: 'customer' };

    return res.status(200).json({
      message: 'Email verified. You can now sign in.',
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      user: publicUser(customer),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/customer/resend-otp ──────────────────────────────────────
/**
 * Body: { email, purpose }
 */
async function resendOtp(req, res, next) {
  try {
    const { email, purpose = 'email_verification' } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }
    if (!['email_verification', 'password_reset'].includes(purpose)) {
      return res.status(400).json({ message: 'Unsupported verification purpose.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { rows } = await db.query(
      'SELECT id, email_verified FROM customers WHERE email = $1',
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No account found with that email.' });
    }
    if (purpose === 'email_verification' && rows[0].email_verified) {
      return res.status(409).json({ message: 'This email is already verified. Please sign in.' });
    }

    const otp = await storeOtp(normalizedEmail, purpose);

    sendOtpEmail(normalizedEmail, otp, purpose).catch((err) =>
      console.error('[customerResendOtp] OTP email failed:', err.message)
    );

    return res.status(200).json({ message: 'A new code has been sent to your email.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/customer/login ───────────────────────────────────────────
/**
 * Body: { email, password }
 *
 * The app's login field is an "email or mobile" input, so a mobile number
 * typed there must work too. The field arrives as `email`, so we detect a
 * mobile number by its shape and look the customer up by mobile_number.
 */
async function login(req, res, next) {
  try {
    const { email, password, mobile_number: mobileNumberField } = req.body || {};
    const identifier = email || mobileNumberField;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const raw = String(identifier).trim();
    const isEmail = raw.includes('@');

    let customer;
    if (isEmail) {
      const normalizedEmail = raw.toLowerCase();
      const { rows } = await db.query(
        'SELECT * FROM customers WHERE email = $1',
        [normalizedEmail]
      );
      customer = rows[0];
    } else {
      // Treat it as a mobile number.
      const mobile = normalizeMobile(raw);
      const { rows } = await db.query(
        'SELECT * FROM customers WHERE mobile_number = $1',
        [mobile]
      );
      customer = rows[0];
    }

    if (!customer) {
      return res.status(401).json({ message: 'Invalid credentials. Try again.' });
    }

    const match = await bcrypt.compare(password, customer.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials. Try again.' });
    }
    if (customer.status === 'suspended') {
      return res.status(403).json({ message: 'Account suspended. Contact support.' });
    }
    if (!customer.email_verified) {
      return res.status(403).json({ message: 'Please verify your account first.' });
    }

    const payload = { sub: customer.id, type: 'customer' };

    return res.status(200).json({
      message: 'Login successful.',
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      user: publicUser(customer),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/customer/profile ───────────────────────────────────────────────
async function getProfile(req, res, next) {
  try {
    const { rows } = await db.query(
      'SELECT * FROM customers WHERE id = $1',
      [req.user.sub]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    return res.status(200).json(await buildProfile(rows[0]));
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/customer/profile ───────────────────────────────────────────────
/**
 * Body: { first_name, last_name, mobile_number, address, latitude, longitude }
 *
 * Only the fields present in the body are written. `profile_completed` is
 * recomputed from the stored row afterwards, so saving an address in one call
 * and a name in another eventually flips the flag.
 */
async function updateProfile(req, res, next) {
  try {
    const body = req.body || {};

    const sets = [];
    const params = [];
    const push = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (body.first_name !== undefined) push('first_name', String(body.first_name || '').trim() || null);
    if (body.last_name !== undefined) push('last_name', String(body.last_name || '').trim() || null);
    if (body.mobile_number !== undefined) push('mobile_number', normalizeMobile(body.mobile_number));
    if (body.address !== undefined) push('address', String(body.address || '').trim() || null);
    if (body.latitude !== undefined && body.latitude !== null && body.latitude !== '') {
      push('latitude', parseFloat(body.latitude));
    }
    if (body.longitude !== undefined && body.longitude !== null && body.longitude !== '') {
      push('longitude', parseFloat(body.longitude));
    }

    if (sets.length > 0) {
      params.push(req.user.sub);
      await db.query(
        `UPDATE customers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params
      );
    }

    // Recompute the completion flag from the row as it now stands.
    const { rows } = await db.query(
      `UPDATE customers
          SET profile_completed = (
                first_name   IS NOT NULL AND first_name   <> ''
            AND last_name    IS NOT NULL AND last_name    <> ''
            AND mobile_number IS NOT NULL AND mobile_number <> ''
            AND address      IS NOT NULL AND address      <> ''
          ),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [req.user.sub]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    return res.status(200).json(await buildProfile(rows[0]));
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/customer/notifications ─────────────────────────────────────────
async function getNotifications(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT n.id,
              n.type,
              n.message,
              n.related_order_id,
              n.is_read,
              n.created_at,
              'ORD-' || LPAD(o.id::text, 4, '0') AS related_order_number
         FROM customer_notifications n
         LEFT JOIN orders o ON o.id = n.related_order_id
        WHERE n.customer_id = $1
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT 100`,
      [req.user.sub]
    );

    return res.status(200).json({ notifications: rows });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/notifications/:id/read ─────────────────────────────────────────
async function markNotificationRead(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid notification id.' });
    }

    const { rows } = await db.query(
      `UPDATE customer_notifications
          SET is_read = TRUE
        WHERE id = $1 AND customer_id = $2
        RETURNING id`,
      [id, req.user.sub]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    return res.status(200).json({ success: true, id: rows[0].id });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/notifications/read-all ─────────────────────────────────────────
async function markAllNotificationsRead(req, res, next) {
  try {
    const { rowCount } = await db.query(
      `UPDATE customer_notifications
          SET is_read = TRUE
        WHERE customer_id = $1 AND is_read = FALSE`,
      [req.user.sub]
    );

    return res.status(200).json({ success: true, updated: rowCount });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/customer/saved-payment ─────────────────────────────────────
/**
 * There is no saved-card table in the schema yet, so this is a no-op that
 * reports success — the app calls it after "remove saved payment" and hides
 * the section on a 200.
 */
async function removeSavedPayment(req, res, next) {
  try {
    return res.status(200).json({
      success: true,
      message: 'No saved payment method to remove.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  getProfile,
  updateProfile,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  removeSavedPayment,
  // Exposed for tests
  __internal: { normalizeMobile, publicUser, buildProfile },
};
