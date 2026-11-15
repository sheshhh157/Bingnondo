const nodemailer = require('nodemailer');

// ─── Transporter ──────────────────────────────────────────────────────────────
// Supports two modes:
//   1. Production — real SMTP (Gmail OAuth2, SendGrid SMTP, etc.)
//   2. Development — Ethereal (fake SMTP, prints preview URL to console)
// ─────────────────────────────────────────────────────────────────────────────

let transporter;

function parseSender(value) {
  const match = String(value || '').match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, ''), email: match[2].trim() };
  return { name: 'Bingnondo Cafe', email: String(value || '').trim() };
}

async function sendWithBrevo({ to, subject, html, text }) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) throw new Error('BREVO_API_KEY is not configured.');

  const sender = parseSender(process.env.MAIL_FROM);
  if (!sender.email || !sender.email.includes('@')) {
    throw new Error('MAIL_FROM must contain a verified Brevo sender email address.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text || html.replace(/<[^>]+>/g, ''),
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result.message || result.code || `HTTP ${response.status}`;
    throw new Error(`Brevo email API failed: ${detail}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[mailer] Brevo accepted email to ${to} (${result.messageId || 'message ID unavailable'}).`);
  }
  return result;
}

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
  // Railway Free, Trial, and Hobby block outbound SMTP. Prefer Brevo's HTTPS
  // API whenever configured; it works on all Railway plans.
  if (process.env.BREVO_API_KEY) {
    console.log('[mailer] Sending email through Brevo API.');
    return sendWithBrevo({ to, subject, html, text });
  }

  const t = await getTransporter();

  const info = await t.sendMail({
    from: process.env.MAIL_FROM || `"Bingnondo Cafe" <${process.env.SMTP_USER || 'noreply@bingnondo.com'}>`,
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
