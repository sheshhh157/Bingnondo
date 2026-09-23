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
// HELPER: strip sensitive fields before sending user object to client
// ─────────────────────────────────────────────────────────────────────────────
function sanitizeStaff(row) {
  const { password_hash, ...safe } = row;
  return safe;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF — LOGIN
// POST /api/auth/staff/login
// Body: { email, password }
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
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return res.status(200).json({
      message: 'Login successful.',
      accessToken,
      refreshToken,
      user: sanitizeStaff(staff),
    });
  } catch (err) {
    console.error('[staffLogin]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD  (staff only)
// POST /api/auth/forgot-password
// Body: { email }
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

    // Always return 200 — don't reveal whether the email exists
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
// Body: { email, otp, newPassword, confirmPassword }
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
// Body: { refreshToken }
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

    // Verify the staff account still exists and is active
    const { rows } = await db.query(
      'SELECT id, status, role FROM staff_accounts WHERE id = $1',
      [decoded.sub]
    );
    if (rows.length === 0 || rows[0].status !== 'active') {
      return res.status(401).json({ message: 'Account not found or inactive.' });
    }

    const newPayload = { sub: decoded.sub, type: decoded.type, role: decoded.role };
    const newAccessToken = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    return res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error('[refreshToken]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// POST /api/auth/logout  (requires valid access token)
// ─────────────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  // req.user is set by authenticateToken middleware
  // Stateless JWT: nothing to invalidate server-side unless you implement
  // a token blacklist table. For now, client simply deletes stored tokens.
  return res.status(200).json({ message: 'Logged out successfully.' });
};

// ─────────────────────────────────────────────────────────────────────────────
// ME  — return current user info from token
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
exports.me = async (req, res) => {
  try {
    const { sub } = req.user;
    const { rows } = await db.query('SELECT * FROM staff_accounts WHERE id = $1', [sub]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    return res.status(200).json({ user: sanitizeStaff(rows[0]) });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};