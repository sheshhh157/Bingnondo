/**
 * Tests for mailer configuration behaviour.
 *
 * Covered:
 *
 *   1. NODE_ENV=production with an empty SMTP_HOST must warn once and make
 *      every send fail with a clear "SMTP is not configured" error — it must
 *      NOT build a transport with an undefined host (which previously failed
 *      per-send with a cryptic DNS error and a misleading "Using SMTP
 *      transporter: undefined" log line).
 *   2. The warning is printed exactly once per process (the stub transport
 *      is cached, matching the real transporter cache).
 *
 * The Ethereal development branch is deliberately not exercised here —
 * nodemailer.createTestAccount() performs real network calls, which this
 * suite must never make.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const MAILER_PATH = require.resolve('../src/utils/mailer');

const freshMailer = () => {
  delete require.cache[MAILER_PATH];
  return require('../src/utils/mailer');
};

test('production without SMTP_HOST warns once and fails sends with a clear error', async () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedSmtpHost = process.env.SMTP_HOST;
  const savedWarn = console.warn;
  const warnings = [];

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SMTP_HOST;

    console.warn = (...args) => { warnings.push(args.join(' ')); };

    const { sendEmail } = freshMailer();

    await assert.rejects(
      sendEmail({ to: 'someone@example.test', subject: 'Test', html: '<p>hi</p>' }),
      /SMTP is not configured \(SMTP_HOST is empty\)/,
      'a send without SMTP configured must reject with the clear error'
    );

    assert.equal(warnings.length, 1, 'the warning should be printed exactly once');
    assert.match(warnings[0], /WARNING.*SMTP_HOST is not set/);
    assert.match(warnings[0], /\.env\.example/);

    await assert.rejects(
      sendEmail({ to: 'someone@example.test', subject: 'Test again', html: '<p>hi</p>' }),
      /SMTP is not configured/,
      'subsequent sends fail the same way'
    );
    assert.equal(warnings.length, 1, 'the cached stub must not warn again');
  } finally {
    console.warn = savedWarn;
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedSmtpHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = savedSmtpHost;
    delete require.cache[MAILER_PATH];
  }
});
