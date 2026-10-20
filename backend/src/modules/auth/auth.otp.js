const crypto = require('crypto');
const db = require('../../config/db');
const { sendEmail } = require('../../utils/mailer');

const OTP_EXPIRY_MINUTES = 10;

const EMAIL_LOGO_URL = 'https://res.cloudinary.com/roumuyf1/image/upload/w_176,q_auto:good/bingnondo/email/cat-logo.png';
const EMAIL_BANNER_URL = 'https://res.cloudinary.com/roumuyf1/image/upload/c_fill,w_864,h_300,f_png/bingnondo/email/bg.png';

const emailHeader = `
          <div style="background-color:#7F1D1D;background-image:url('${EMAIL_BANNER_URL}');background-size:cover;background-position:center;border-radius:12px 12px 0 0;padding:20px 24px;text-align:left;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td style="vertical-align:middle;padding:0 14px 0 0;">
                  <img src="${EMAIL_LOGO_URL}" alt="Bingnondo Cafe" width="64" style="display:block;width:64px;height:auto;border:0;" />
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.08em;color:#FFFBEB;">Bingnondo Cafe</div>
                  <div style="width:44px;height:2px;background:#D97706;margin:8px 0 0;border-radius:1px;"></div>
                </td>
              </tr>
            </table>
          </div>`;

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
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {string} the generated OTP (plain text — stored as hash in prod, plain here for simplicity)
 */
async function storeOtp(contact, purpose, client = db) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate older unused OTPs for same contact+purpose
  await client.query(
    `UPDATE otp_verifications
     SET verified_at = NOW()
     WHERE contact = $1
       AND purpose = $2
       AND verified_at IS NULL
       AND expires_at > NOW()`,
    [contact, purpose]
  );

  // Insert new OTP
  await client.query(
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
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {{ valid: boolean, reason?: 'not_found'|'expired'|'already_used' }}
 */
async function verifyOtp(contact, otpCode, purpose, client = db) {
  const { rows } = await client.query(
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

  // Consume the OTP atomically — if a concurrent request already used it,
  // rowCount is 0 and this request must not proceed.
  const consumed = await client.query(
    'UPDATE otp_verifications SET verified_at = NOW() WHERE id = $1 AND verified_at IS NULL RETURNING id',
    [record.id]
  );

  if (consumed.rowCount === 0) {
    return { valid: false, reason: 'already_used' };
  }

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
      <div style="background:#FDF6E3;padding:24px 12px;font-family:Karla,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;">
        <div style="max-width:480px;margin:0 auto;">
${emailHeader}
          <div style="background:#FFFFFF;border:1px solid #E9C998;border-top:0;border-radius:0 0 12px 12px;padding:28px 24px;">
            <h2 style="font-family:Georgia,'Times New Roman',serif;color:#7F1D1D;font-size:22px;margin:0 0 12px;">Welcome to Bingnondo Cafe!</h2>
            <p style="color:#3B0A0A;font-size:15px;line-height:1.5;margin:0 0 20px;">Use this code to verify your email address.</p>
            <div style="background:#FDF6E3;border:1px solid #C9A262;border-radius:10px;padding:18px 24px;text-align:center;margin:0 0 20px;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:2rem;font-weight:700;letter-spacing:0.25em;color:#7F1D1D;">${otp}</span>
            </div>
            <p style="color:#7C4A2A;font-size:13px;line-height:1.5;margin:0;">This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you did not create an account, you can safely ignore this email.</p>
          </div>
        </div>
      </div>
    `,
    password_reset: `
      <div style="background:#FDF6E3;padding:24px 12px;font-family:Karla,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;">
        <div style="max-width:480px;margin:0 auto;">
${emailHeader}
          <div style="background:#FFFFFF;border:1px solid #E9C998;border-top:0;border-radius:0 0 12px 12px;padding:28px 24px;">
            <h2 style="font-family:Georgia,'Times New Roman',serif;color:#7F1D1D;font-size:22px;margin:0 0 12px;">Reset your password</h2>
            <p style="color:#3B0A0A;font-size:15px;line-height:1.5;margin:0 0 20px;">Use this code to reset your Bingnondo Cafe password.</p>
            <div style="background:#FDF6E3;border:1px solid #C9A262;border-radius:10px;padding:18px 24px;text-align:center;margin:0 0 20px;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:2rem;font-weight:700;letter-spacing:0.25em;color:#7F1D1D;">${otp}</span>
            </div>
            <p style="color:#7C4A2A;font-size:13px;line-height:1.5;margin:0;">This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you did not request a password reset, please ignore this email.</p>
          </div>
        </div>
      </div>
    `,
  };

  await sendEmail({
    to:      toEmail,
    subject: subjects[purpose] || 'Bingnondo Cafe — Verification Code',
    html:    bodies[purpose]   || `<p>Your OTP is: <strong>${otp}</strong></p>`,
  });
}

/**
 * Notify an account that its password was just changed (self-service reset).
 * Alerts the owner if the change was not theirs.
 *
 * @param {string} toEmail
 */
async function sendPasswordChangedEmail(toEmail) {
  await sendEmail({
    to:      toEmail,
    subject: 'Bingnondo Cafe — Your password was changed',
    html: `
      <div style="background:#FDF6E3;padding:24px 12px;font-family:Karla,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;">
        <div style="max-width:480px;margin:0 auto;">
${emailHeader}
          <div style="background:#FFFFFF;border:1px solid #E9C998;border-top:0;border-radius:0 0 12px 12px;padding:28px 24px;">
            <h2 style="font-family:Georgia,'Times New Roman',serif;color:#7F1D1D;font-size:22px;margin:0 0 12px;">Your password was changed</h2>
            <p style="color:#3B0A0A;font-size:15px;line-height:1.5;margin:0 0 12px;">The password for your Bingnondo Cafe account was just reset using a one-time code sent to this email address.</p>
            <p style="color:#3B0A0A;font-size:15px;line-height:1.5;margin:0 0 20px;">If this was you, no action is needed.</p>
            <p style="color:#7C4A2A;font-size:13px;line-height:1.5;margin:0;">If this was NOT you, contact your administrator immediately — someone may have access to your email inbox.</p>
          </div>
        </div>
      </div>
    `,
  });
}

module.exports = { generateOtp, storeOtp, verifyOtp, sendOtpEmail, sendPasswordChangedEmail };