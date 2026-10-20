const bcrypt = require('bcrypt');
const db = require('../../config/db');
const {
  storeOtp,
  verifyOtp,
  sendOtpEmail,
  sendPasswordChangedEmail,
} = require('./auth.otp');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('./auth.jwt');

const BCRYPT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeStaff(row) {
  const { password_hash, ...safe } = row;
  return safe;
}

function sanitizeRider(row) {
  const { password_hash, ...safe } = row;
  return safe;
}

// Resolve which account (staff or rider) owns an email for password reset.
// Mirrors the shared login resolution: staff first, then riders.
async function findResetAccount(email, client = db) {
  const { rows: staffRows } = await client.query(
    "SELECT id FROM staff_accounts WHERE email = $1 AND status = 'active'",
    [email]
  );
  if (staffRows.length > 0) {
    return { type: 'staff', id: staffRows[0].id };
  }

  const { rows: riderRows } = await client.query(
    "SELECT id FROM riders WHERE email = $1 AND status != 'inactive' ORDER BY id LIMIT 1",
    [email]
  );
  if (riderRows.length > 0) {
    return { type: 'rider', id: riderRows[0].id };
  }

  return null;
}

const RESET_TABLES = { staff: 'staff_accounts', rider: 'riders' };

async function writeAuditLog(client, actorId, action, targetType, targetId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED LOGIN — Staff + Rider
// POST /api/auth/login
// Body: { email, password }
//
// Resolution order:
//   1. Check staff_accounts — if found, verify password, return type='staff'
//   2. Check riders         — if found, verify password, return type='rider'
//   3. Neither found        — 401
// ─────────────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── 1. Check staff_accounts ──────────────────────────────────────────────
    const { rows: staffRows } = await db.query(
      'SELECT * FROM staff_accounts WHERE email = $1',
      [normalizedEmail]
    );

    if (staffRows.length > 0) {
      const staff = staffRows[0];

      const match = await bcrypt.compare(password, staff.password_hash);
      if (!match) {
        return res.status(401).json({ message: 'Invalid credentials. Try again.' });
      }
      if (staff.status === 'deactivated') {
        return res.status(403).json({ message: 'Account suspended. Contact your administrator.' });
      }

      const payload = { sub: staff.id, type: 'staff', role: staff.role };
      const accessToken  = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      return res.status(200).json({
        message: 'Login successful.',
        accessToken,
        refreshToken,
        user: { ...sanitizeStaff(staff), type: 'staff' },
      });
    }

    // ── 2. Check riders ──────────────────────────────────────────────────────
    const { rows: riderRows } = await db.query(
      "SELECT * FROM riders WHERE email = $1 AND status != 'inactive'",
      [normalizedEmail]
    );

    if (riderRows.length > 0) {
      const rider = riderRows[0];

      if (!rider.password_hash) {
        return res.status(401).json({ message: 'Account not set up yet. Contact your administrator.' });
      }

      const match = await bcrypt.compare(password, rider.password_hash);
      if (!match) {
        return res.status(401).json({ message: 'Invalid credentials. Try again.' });
      }

      // Update last_login
      await db.query(
        'UPDATE riders SET last_login = NOW() WHERE id = $1',
        [rider.id]
      );

      const payload = { sub: rider.id, type: 'rider' };
      const accessToken  = signAccessToken(payload);
      const refreshToken = signRefreshToken(payload);

      return res.status(200).json({
        message: 'Login successful.',
        accessToken,
        refreshToken,
        user: { ...sanitizeRider(rider), type: 'rider' },
      });
    }

    // ── 3. Not found in either table ─────────────────────────────────────────
    return res.status(401).json({ message: 'Invalid credentials. Try again.' });

  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STAFF LOGIN (existing — kept for backward compatibility)
// POST /api/auth/staff/login
// ─────────────────────────────────────────────────────────────────────────────
exports.staffLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const { rows } = await db.query(
      'SELECT * FROM staff_accounts WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials. Try again.' });
    }
    const staff = rows[0];

    const match = await bcrypt.compare(password, staff.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials. Try again.' });
    }
    if (staff.status === 'deactivated') {
      return res.status(403).json({ message: 'Account suspended. Contact your administrator.' });
    }

    const payload = { sub: staff.id, type: 'staff', role: staff.role };
    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return res.status(200).json({
      message: 'Login successful.',
      accessToken,
      refreshToken,
      user: { ...sanitizeStaff(staff), type: 'staff' },
    });
  } catch (err) {
    console.error('[staffLogin]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD (staff + riders)
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────────────
const FORGOT_MESSAGE = 'If that email is registered, a reset code has been sent.';

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const account = await findResetAccount(normalizedEmail);

    if (account) {
      const otp = await storeOtp(normalizedEmail, 'password_reset');

      // Send detached: the HTTP response must not wait on SMTP, otherwise
      // response timing would reveal whether the email is registered.
      sendOtpEmail(normalizedEmail, otp, 'password_reset').catch((err) =>
        console.error('[forgotPassword] OTP email failed:', err.message)
      );
    }

    // Identical response for known/unknown emails and internal failures alike.
    return res.status(200).json({ message: FORGOT_MESSAGE });
  } catch (err) {
    console.error('[forgotPassword]', err);
    return res.status(200).json({ message: FORGOT_MESSAGE });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD
// POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (typeof email !== 'string' || typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ message: 'Enter the 6-digit code from your email.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const account = await findResetAccount(normalizedEmail, client);
      if (!account) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'This account can no longer reset its password. Contact your administrator.' });
      }

      const result = await verifyOtp(normalizedEmail, String(otp), 'password_reset', client);
      if (!result.valid) {
        await client.query('ROLLBACK');
        if (result.reason === 'expired') {
          return res.status(400).json({ message: 'OTP expired. Request a new one.' });
        }
        return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
      }

      const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await client.query(
        `UPDATE ${RESET_TABLES[account.type]} SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, account.id]
      );

      await writeAuditLog(
        client,
        // audit_log.actor_id has a FK to staff_accounts, so a rider-initiated
        // reset logs no actor — the target columns identify the account.
        account.type === 'staff' ? account.id : null,
        'self_reset_password',
        account.type === 'staff' ? 'staff_account' : 'rider',
        account.id,
        { email: normalizedEmail, account_type: account.type }
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Alert the owner (detached — never affects the reset result).
    sendPasswordChangedEmail(normalizedEmail).catch((err) =>
      console.error('[resetPassword] password-changed email failed:', err.message)
    );

    return res.status(200).json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('[resetPassword]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH TOKEN
// POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required.' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ message: 'Invalid or expired refresh token.' });
    }

    // Verify account still exists and is active — check correct table by type
    if (decoded.type === 'rider') {
      const { rows } = await db.query(
        "SELECT id, status FROM riders WHERE id = $1 AND status != 'inactive'",
        [decoded.sub]
      );
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Account not found or inactive.' });
      }
    } else {
      const { rows } = await db.query(
        "SELECT id, status FROM staff_accounts WHERE id = $1 AND status = 'active'",
        [decoded.sub]
      );
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Account not found or inactive.' });
      }
    }

    const newPayload     = { sub: decoded.sub, type: decoded.type, role: decoded.role };
    const newAccessToken  = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    return res.status(200).json({
      accessToken:  newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('[refreshToken]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  return res.status(200).json({ message: 'Logged out successfully.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// ME — return current user info from token
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
exports.me = async (req, res) => {
  try {
    const { sub, type } = req.user;

    if (type === 'rider') {
      const { rows } = await db.query('SELECT * FROM riders WHERE id = $1', [sub]);
      if (rows.length === 0) return res.status(404).json({ message: 'Rider not found.' });
      return res.status(200).json({ user: { ...sanitizeRider(rows[0]), type: 'rider' } });
    }

    const { rows } = await db.query('SELECT * FROM staff_accounts WHERE id = $1', [sub]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    return res.status(200).json({ user: { ...sanitizeStaff(rows[0]), type: 'staff' } });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};