const nodemailer = require('nodemailer');

// ─── Transporter ──────────────────────────────────────────────────────────────
// Supports two modes:
//   1. Production — real SMTP (Gmail OAuth2, SendGrid SMTP, etc.)
//   2. Development — Ethereal (fake SMTP, prints preview URL to console)
// ─────────────────────────────────────────────────────────────────────────────

let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.NODE_ENV === 'production' || process.env.SMTP_HOST) {
    // ── Production / Staging: use real SMTP credentials from .env ───────────
    // For Gmail: use an App Password (not your account password).
    // Set SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_SECURE=true,
    //     SMTP_USER=you@gmail.com, SMTP_PASS=your-app-password
    if (!process.env.SMTP_HOST) {
      // Production without SMTP configured: warn once and make sends fail
      // loudly instead of creating a transport with an undefined host.
      console.warn(
        '[mailer] WARNING: NODE_ENV=production but SMTP_HOST is not set — emails cannot be delivered. ' +
        'Configure SMTP_* in backend/.env (see .env.example).'
      );
      transporter = {
        sendMail: async () => {
          throw new Error('SMTP is not configured (SMTP_HOST is empty)');
        },
      };
      return transporter;
    }

    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: String(process.env.SMTP_USER || '').trim(),
        pass: String(process.env.SMTP_PASS || '').replace(/\s+/g, ''),
      },
    });
    console.log('[mailer] Using SMTP transporter:', process.env.SMTP_HOST);
  } else {
    // ── Development: auto-create Ethereal test account ─────────────────────
    // Ethereal is a free fake SMTP service by Nodemailer.
    // Emails are never actually delivered — they appear at the preview URL
    // printed to the console.
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host:   'smtp.ethereal.email',
      port:   587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('[mailer] Using Ethereal test SMTP. Emails are NOT delivered.');
    console.log('[mailer] Preview OTPs at: https://ethereal.email');
    console.log(`[mailer] Login: ${testAccount.user} / ${testAccount.pass}`);
  }

  return transporter;
}

/**
 * Send an email.
 *
 * @param {{ to: string, subject: string, html: string, text?: string }} options
 */
async function sendEmail({ to, subject, html, text }) {
  const t = await getTransporter();

  const info = await t.sendMail({
    from: process.env.MAIL_FROM || '"Bingnondo Cafe" <noreply@bingnondo.com>',
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''), // strip HTML tags as fallback plain text
  });

  // In development, print the Ethereal preview URL
  if (process.env.NODE_ENV !== 'production') {
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) {
      console.log(`[mailer] OTP email preview: ${preview}`);
    } else {
      // Ethereal preview not available — log OTP directly for dev convenience
      // Extract OTP from subject line or log the full info
      console.log(`[mailer] Email sent to ${to} — subject: "${subject}"`);
    }
  }

  return info;
}

module.exports = { sendEmail };