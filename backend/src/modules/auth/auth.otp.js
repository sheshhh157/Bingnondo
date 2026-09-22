const crypto = require('crypto');
const db = require('../../config/db');
const { sendEmail } = require('../../utils/mailer');

const OTP_EXPIRY_MINUTES = 10;

/**
 * Generate a cryptographically random 6-digit OTP string.
 */
function generateOtp() {
  // Use crypto to get a random number between 100000–999999
  const buffer = crypto.randomBytes(3); // 3 bytes = up to 16,777,215
  const num = buffer.readUIntBE(0, 3) % 900000 + 100000;
  return String(num);
}

/**
 * Store a new OTP in otp_verifications.
 * Invalidates any previous unused OTP for the same contact + purpose.
 *
 * @param {string} contact - email or mobile number
 * @param {'email_verification'|'mobile_verification'|'password_reset'} purpose
 * @returns {string} the generated OTP (plain text — stored as hash in prod, plain here for simplicity)
 */
async function storeOtp(contact, purpose) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate older unused OTPs for same contact+purpose
  await db.query(
    `UPDATE otp_verifications
     SET verified_at = NOW()
     WHERE contact = $1
       AND purpose = $2
       AND verified_at IS NULL
       AND expires_at > NOW()`,
    [contact, purpose]
  );

  // Insert new OTP
  await db.query(
    `INSERT INTO otp_verifications (contact, otp_code, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [contact, otp, purpose, expiresAt]
  );

  return otp;
}

/**
 * Verify an OTP.
 * Marks it as used on success.
 *
 * @param {string} contact
 * @param {string} otpCode
 * @param {'email_verification'|'mobile_verification'|'password_reset'} purpose
 * @returns {{ valid: boolean, reason?: 'not_found'|'expired'|'already_used' }}
 */
async function verifyOtp(contact, otpCode, purpose) {
  const { rows } = await db.query(
    `SELECT id, expires_at, verified_at
     FROM otp_verifications
     WHERE contact = $1
       AND otp_code = $2
       AND purpose = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [contact, otpCode, purpose]
  );

  if (rows.length === 0) {
    return { valid: false, reason: 'not_found' };
  }

  const record = rows[0];

  if (record.verified_at !== null) {
    return { valid: false, reason: 'already_used' };
  }

  if (new Date(record.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  // Mark as used
  await db.query(
    'UPDATE otp_verifications SET verified_at = NOW() WHERE id = $1',
    [record.id]
  );

  return { valid: true };
}

/**
 * Send an OTP via email using the configured mailer.
 *
 * @param {string} toEmail
 * @param {string} otp
 * @param {'email_verification'|'password_reset'} purpose
 */
async function sendOtpEmail(toEmail, otp, purpose) {
  const subjects = {
    email_verification: 'Bingnondo Cafe — Verify your email',
    password_reset:     'Bingnondo Cafe — Password reset code',
  };

  const bodies = {
    email_verification: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;">
        <h2 style="color:#b45309;margin-bottom:8px;">Welcome to Bingnondo Cafe!</h2>
        <p style="color:#374151;">Use this code to verify your email address.</p>
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:20px 24px;text-align:center;margin:24px 0;">
          <span style="font-size:2rem;font-weight:700;letter-spacing:0.2em;color:#92400e;">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:0.875rem;">This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you did not create an account, you can safely ignore this email.</p>
      </div>
    `,
    password_reset: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px 24px;">
        <h2 style="color:#b45309;margin-bottom:8px;">Reset your password</h2>
        <p style="color:#374151;">Use this code to reset your Bingnondo Cafe password.</p>
        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:20px 24px;text-align:center;margin:24px 0;">
          <span style="font-size:2rem;font-weight:700;letter-spacing:0.2em;color:#92400e;">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:0.875rem;">This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you did not request a password reset, please ignore this email.</p>
      </div>
    `,
  };

  await sendEmail({
    to:      toEmail,
    subject: subjects[purpose] || 'Bingnondo Cafe — Verification Code',
    html:    bodies[purpose]   || `<p>Your OTP is: <strong>${otp}</strong></p>`,
  });
}

module.exports = { generateOtp, storeOtp, verifyOtp, sendOtpEmail };