const bcrypt = require('bcrypt');
const db = require('../../config/db');
const {
  storeOtp,
  verifyOtp,
  sendOtpEmail,
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
// FORGOT PASSWORD (staff only)
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const normalizedEmail = email.toLowerCase().trim();

    const { rows: staffRows } = await db.query(
      "SELECT id FROM staff_accounts WHERE email = $1 AND status = 'active'",
      [normalizedEmail]
    );

    if (staffRows.length === 0) {
      return res.status(200).json({ message: 'If that email is registered, a reset code has been sent.' });
    }

    const otp = await storeOtp(normalizedEmail, 'password_reset');
    await sendOtpEmail(normalizedEmail, otp, 'password_reset');

    return res.status(200).json({ message: 'If that email is registered, a reset code has been sent.' });
  } catch (err) {
    console.error('[forgotPassword]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
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
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const result = await verifyOtp(normalizedEmail, otp, 'password_reset');
    if (!result.valid) {
      if (result.reason === 'expired') {
        return res.status(400).json({ message: 'OTP expired. Request a new one.' });
      }
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await db.query(
      'UPDATE staff_accounts SET password_hash = $1, updated_at = NOW() WHERE email = $2',
      [passwordHash, normalizedEmail]
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