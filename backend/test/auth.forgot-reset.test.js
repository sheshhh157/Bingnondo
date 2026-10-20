/**
 * Tests for the self-service password reset flow:
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 *
 * Covered:
 *
 *   1. Unknown emails get the identical generic 200 and no OTP row
 *      (anti-enumeration), and a failing mail send still returns the
 *      generic 200 instead of a 500.
 *   2. Staff: requesting a code stores a ~10-minute OTP and emails it;
 *      resetting with that code replaces the password (the old one stops
 *      working at /login), marks the code single-use, and writes a
 *      `self_reset_password` audit row plus a "password was changed"
 *      notification email.
 *   3. A wrong guess does not consume the real code; expired codes get the
 *      expired message; format/mismatch/short-password validation holds.
 *   4. Riders with a NULL password_hash can set their first password — the
 *      exact case the old staff-only endpoint could never rescue.
 *   5. Inactive riders and deactivated staff stay generic with no OTP row.
 *   6. Both limiters: the 4th forgot-password request and the 11th failed
 *      reset attempt inside the window are rejected with 429.
 *
 * The mailer is stubbed via require.cache so tests never touch the network;
 * the OTP is extracted from the captured email body, exactly what a real
 * user would read. Database-backed tests skip when no database is reachable
 * and remove every row they create.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

// ─── Mailer stub (installed before the routers are required) ─────────────────

const mailerPath = require.resolve('../src/utils/mailer');
const sentEmails = [];
let mailShouldFail = false;

require.cache[mailerPath] = {
  id: mailerPath,
  filename: mailerPath,
  loaded: true,
  exports: {
    sendEmail: async ({ to, subject, html }) => {
      if (mailShouldFail) throw new Error('SMTP is down (test stub)');
      sentEmails.push({ to, subject, html });
      return { messageId: `stub-${sentEmails.length}` };
    },
  },
};

let db = null;
try {
  db = require('../src/config/db');
} catch {
  db = null;
}

const canQuery = async () => {
  if (!db) return false;
  try {
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

// ─── HTTP harness ─────────────────────────────────────────────────────────────

const FORGOT_MESSAGE = 'If that email is registered, a reset code has been sent.';

/**
 * Bare Express app around the real auth router. A fresh app per `call()`
 * gives fresh in-memory limiter state; the limiter tests use `startApp()`
 * so consecutive requests share one limiter instance.
 */
function buildApp({ withLimits = false } = {}) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  if (withLimits) {
    const { otpLimiter, resetLimiter } = require('../src/middleware/rate-limit.middleware');
    app.use('/api/auth/forgot-password', otpLimiter);
    app.use('/api/auth/reset-password', resetLimiter);
  }
  app.use('/api/auth', require('../src/modules/auth/auth.routes'));
  return app;
}

async function startApp(opts) {
  const server = buildApp(opts).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, port: server.address().port };
}

async function callOn(port, method, path, { body } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function call(method, path, { body } = {}) {
  const { server, port } = await startApp();
  try {
    return await callOn(port, method, path, { body });
  } finally {
    server.close();
  }
}

const forgot = (email) => call('POST', '/api/auth/forgot-password', { body: { email } });
const reset = (payload) => call('POST', '/api/auth/reset-password', { body: payload });

// ─── Helpers ──────────────────────────────────────────────────────────────────

let seq = 0;
const uniqueEmail = () => `__fp_test_${Date.now()}_${seq++}@example.test`;

const codeFromEmail = (email) => {
  const mail = sentEmails.filter((m) => m.to === email).pop();
  assert.ok(mail, `no email captured for ${email}`);
  // Anchor on the code's own span — a loose /\d{6}/ would match hex colors
  // like #374151 in the inline styles.
  const match = mail.html.match(/(\d{6})<\/span>/);
  assert.ok(match, 'email body should contain a 6-digit code in its span');
  return match[1];
};

const latestOtpRow = async (email) => {
  const { rows } = await db.query(
    `SELECT id, otp_code, purpose, expires_at, verified_at
     FROM otp_verifications WHERE contact = $1 ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  return rows[0] || null;
};

const otpRowCount = async (email) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM otp_verifications WHERE contact = $1`, [email]);
  return rows[0].n;
};

const createStaff = async (email, password, status = 'active') => {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(password, 4);
  const { rows } = await db.query(
    `INSERT INTO staff_accounts (full_name, email, password_hash, role, status)
     VALUES ('FP Test Staff', $1, $2, 'cashier', $3) RETURNING id`,
    [email, hash, status]
  );
  return rows[0].id;
};

const createRider = async (email, status = 'available') => {
  const { rows } = await db.query(
    `INSERT INTO riders (full_name, mobile_number, email, status)
     VALUES ('FP Test Rider', $1, $2, $3) RETURNING id`,
    [`0999${String(Date.now()).slice(-7)}${seq++}`, email, status]
  );
  return rows[0].id;
};

const storedHash = async (table, id) => {
  const { rows } = await db.query(`SELECT password_hash FROM ${table} WHERE id = $1`, [id]);
  return rows[0]?.password_hash || null;
};

const cleanupAccount = async ({ staffId, riderId, email }) => {
  if (email) await db.query(`DELETE FROM otp_verifications WHERE contact = $1`, [email]);
  if (staffId) {
    await db.query(`DELETE FROM audit_log WHERE target_type = 'staff_account' AND target_id = $1`, [staffId]);
    await db.query(`DELETE FROM staff_accounts WHERE id = $1`, [staffId]);
  }
  if (riderId) {
    await db.query(`DELETE FROM audit_log WHERE target_type = 'rider' AND target_id = $1`, [riderId]);
    await db.query(`DELETE FROM riders WHERE id = $1`, [riderId]);
  }
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test('unknown email: identical generic 200, no OTP row, no email', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();
  const emailsBefore = sentEmails.length;

  const res = await forgot(email);

  assert.equal(res.status, 200);
  assert.equal(res.body?.message, FORGOT_MESSAGE);
  assert.equal(await otpRowCount(email), 0);
  assert.equal(sentEmails.length, emailsBefore, 'no email should be sent for unknown addresses');
});

test('staff: full reset flow — emailed code works, old password dies, code is single-use', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();
  const oldPassword = 'oldpassword123';
  const newPassword = 'newpassword456';
  let staffId = null;
  try {
    staffId = await createStaff(email, oldPassword);

    const f = await forgot(email);
    assert.equal(f.status, 200);
    assert.equal(f.body?.message, FORGOT_MESSAGE);

    const row = await latestOtpRow(email);
    assert.ok(row, 'OTP row should exist');
    assert.equal(row.purpose, 'password_reset');
    const minutesLeft = (new Date(row.expires_at) - Date.now()) / 60000;
    assert.ok(minutesLeft > 8 && minutesLeft <= 10, `expiry should be ~10 minutes, got ${minutesLeft.toFixed(1)}`);

    const code = codeFromEmail(email);

    // A wrong guess must not consume the real code.
    const wrong = await reset({ email, otp: '000000', newPassword, confirmPassword: newPassword });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body?.message, 'Invalid OTP. Please try again.');

    const ok = await reset({ email, otp: code, newPassword, confirmPassword: newPassword });
    assert.equal(ok.status, 200);
    assert.equal(ok.body?.message, 'Password reset successfully. You can now sign in.');

    const bcrypt = require('bcrypt');
    assert.equal(await bcrypt.compare(newPassword, await storedHash('staff_accounts', staffId)), true);

    const oldLogin = await call('POST', '/api/auth/login', { body: { email, password: oldPassword } });
    assert.equal(oldLogin.status, 401, 'the old password must stop working');
    const newLogin = await call('POST', '/api/auth/login', { body: { email, password: newPassword } });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.body?.user?.type, 'staff');

    const used = await latestOtpRow(email);
    assert.ok(used.verified_at, 'the code should be marked as used');

    const replay = await reset({ email, otp: code, newPassword: 'anotherpass789', confirmPassword: 'anotherpass789' });
    assert.equal(replay.status, 400, 'a used code must not work again');

    const { rows: auditRows } = await db.query(
      `SELECT action, details FROM audit_log
       WHERE target_type = 'staff_account' AND target_id = $1 AND action = 'self_reset_password'`,
      [staffId]
    );
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].details?.email, email);

    const changedMail = sentEmails.filter((m) => m.to === email && /password was changed/i.test(m.subject));
    assert.ok(changedMail.length >= 1, 'a password-changed notification should be emailed');
  } finally {
    await cleanupAccount({ staffId, email });
  }
});

test('expired code is rejected with the expired message', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();
  const password = 'whatever123';
  let staffId = null;
  try {
    staffId = await createStaff(email, password);
    await db.query(
      `INSERT INTO otp_verifications (contact, otp_code, purpose, expires_at)
       VALUES ($1, '123456', 'password_reset', NOW() - INTERVAL '1 minute')`,
      [email]
    );

    const res = await reset({ email, otp: '123456', newPassword: password, confirmPassword: password });
    assert.equal(res.status, 400);
    assert.equal(res.body?.message, 'OTP expired. Request a new one.');
  } finally {
    await cleanupAccount({ staffId, email });
  }
});

test('validation errors: missing fields, bad format, mismatch, short password', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();

  const missing = await call('POST', '/api/auth/reset-password', { body: { email } });
  assert.equal(missing.status, 400);
  assert.equal(missing.body?.message, 'All fields are required.');

  const badFormat = await reset({ email, otp: 'abcdef', newPassword: 'longenough1', confirmPassword: 'longenough1' });
  assert.equal(badFormat.status, 400);
  assert.equal(badFormat.body?.message, 'Enter the 6-digit code from your email.');

  const mismatch = await reset({ email, otp: '123456', newPassword: 'longenough1', confirmPassword: 'different2' });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body?.message, 'Passwords do not match.');

  const short = await reset({ email, otp: '123456', newPassword: 'short1', confirmPassword: 'short1' });
  assert.equal(short.status, 400);
  assert.equal(short.body?.message, 'Password must be at least 8 characters.');
});

test('rider with NULL password_hash can set a first password and sign in', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();
  const password = 'ridersnewpass1';
  let riderId = null;
  try {
    riderId = await createRider(email);
    assert.equal(await storedHash('riders', riderId), null, 'rider should start with no password');

    const f = await forgot(email);
    assert.equal(f.status, 200);
    const code = codeFromEmail(email);

    const ok = await reset({ email, otp: code, newPassword: password, confirmPassword: password });
    assert.equal(ok.status, 200);

    const bcrypt = require('bcrypt');
    assert.equal(await bcrypt.compare(password, await storedHash('riders', riderId)), true);

    const login = await call('POST', '/api/auth/login', { body: { email, password } });
    assert.equal(login.status, 200);
    assert.equal(login.body?.user?.type, 'rider');

    const { rows: auditRows } = await db.query(
      `SELECT actor_id FROM audit_log
       WHERE target_type = 'rider' AND target_id = $1 AND action = 'self_reset_password'`,
      [riderId]
    );
    assert.equal(auditRows.length, 1);
    assert.equal(auditRows[0].actor_id, null, 'rider resets log no actor (FK to staff_accounts)');
  } finally {
    await cleanupAccount({ riderId, email });
  }
});

test('inactive rider and deactivated staff stay generic with no OTP row', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const riderEmail = uniqueEmail();
  const staffEmail = uniqueEmail();
  let riderId = null;
  let staffId = null;
  try {
    riderId = await createRider(riderEmail, 'inactive');
    staffId = await createStaff(staffEmail, 'somepass123', 'deactivated');

    for (const email of [riderEmail, staffEmail]) {
      const res = await forgot(email);
      assert.equal(res.status, 200);
      assert.equal(res.body?.message, FORGOT_MESSAGE);
      assert.equal(await otpRowCount(email), 0);
    }
  } finally {
    await cleanupAccount({ riderId, email: riderEmail });
    await cleanupAccount({ staffId, email: staffEmail });
  }
});

test('a failing mail send still returns the generic 200 (no 500 leak)', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const email = uniqueEmail();
  let staffId = null;
  mailShouldFail = true;
  try {
    staffId = await createStaff(email, 'somepass123');

    const res = await forgot(email);
    assert.equal(res.status, 200);
    assert.equal(res.body?.message, FORGOT_MESSAGE);

    // The OTP was still generated and stored — only delivery failed.
    assert.ok(await latestOtpRow(email));
  } finally {
    mailShouldFail = false;
    await cleanupAccount({ staffId, email });
  }
});

test('otp limiter: the 4th forgot-password request in the window gets 429', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const { server, port } = await startApp({ withLimits: true });
  try {
    for (let i = 0; i < 3; i++) {
      const res = await callOn(port, 'POST', '/api/auth/forgot-password', { body: { email: uniqueEmail() } });
      assert.equal(res.status, 200, `request ${i + 1} should pass the limiter`);
    }
    const fourth = await callOn(port, 'POST', '/api/auth/forgot-password', { body: { email: uniqueEmail() } });
    assert.equal(fourth.status, 429);
    assert.match(fourth.body?.message || '', /Too many OTP requests/);
  } finally {
    server.close();
  }
});

test('reset limiter: the 11th failed attempt in the window gets 429', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const { server, port } = await startApp({ withLimits: true });
  try {
    const email = uniqueEmail();
    const body = { email, otp: '000000', newPassword: 'longenough1', confirmPassword: 'longenough1' };

    for (let i = 0; i < 10; i++) {
      const res = await callOn(port, 'POST', '/api/auth/reset-password', { body });
      assert.equal(res.status, 400, `attempt ${i + 1} should be a normal rejection`);
    }
    const eleventh = await callOn(port, 'POST', '/api/auth/reset-password', { body });
    assert.equal(eleventh.status, 429);
    assert.match(eleventh.body?.message || '', /Too many reset attempts/);
  } finally {
    server.close();
  }
});
