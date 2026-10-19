/**
 * Tests for rider account creation (POST /api/admin/riders).
 *
 * Covered:
 *
 *   1. Creating a rider without a password is refused with a 400 — it no
 *      longer silently inserts a NULL hash.
 *   2. The endpoint's contract is `password`, not the form's `temp_password`.
 *      Sending only `temp_password` (exactly what the buggy admin UI used to
 *      post) must be rejected, which pins the fix in the frontend wrapper
 *      (`adminRidersAPI.create` maps `temp_password` -> `password`) in place.
 *   3. A create that supplies `password` yields a usable account: the stored
 *      hash verifies with bcrypt and the rider can sign in via /api/auth/login.
 *
 * Why this needs asserting: the account row was previously created with
 * `password_hash = NULL` (the body field name never matched) and no error was
 * returned. The rider then hit "Account not set up yet. Contact your
 * administrator." at login and there is no self-service setup flow, so the
 * account was permanently locked out. Nothing in the schema catches either
 * half of that.
 *
 * The database-backed tests are skipped when no database is reachable, so the
 * file still runs without one. Each test creates its own throwaway rider and
 * removes it (and its audit rows) afterwards, so seeded data is untouched.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

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

let adminToken = null;
const signInAdmin = async () => {
  if (adminToken) return adminToken;
  const account = await db.query(
    `SELECT id FROM staff_accounts WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1`);
  if (account.rowCount === 0) return null;
  const jwt = require('jsonwebtoken');
  adminToken = jwt.sign(
    { sub: account.rows[0].id, type: 'staff', role: 'admin' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' },
  );
  return adminToken;
};

/**
 * Bare Express app around the real routers. Deliberately not `server.js`:
 * that binds a port, opens Socket.io and installs a startup rate limit.
 */
function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/riders', require('../src/modules/admin/admin.riders.routes'));
  app.use('/api/auth', require('../src/modules/auth/auth.routes'));
  return app;
}

async function call(method, path, { body, token } = {}) {
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let seq = 0;
const uniqueEmail = () => `__rider_test_${Date.now()}_${seq++}@example.test`;
const uniqueMobile = () => `0999${String(Date.now()).slice(-7)}${seq}`;

// Remove the rider together with the audit rows the handler wrote for it, so
// the tables are left exactly as found.
const cleanupRider = async (id) => {
  if (!id) return;
  await db.query(`DELETE FROM audit_log WHERE target_type = 'rider' AND target_id = $1`, [id]);
  await db.query(`DELETE FROM riders WHERE id = $1`, [id]);
};

const findRiderByEmail = async (email) => {
  const { rows } = await db.query(
    `SELECT id, password_hash FROM riders WHERE email = $1`, [email]);
  return rows[0] || null;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test('creating a rider without a password is refused (no NULL-hash account)', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const email = uniqueEmail();
  const res = await call('POST', '/api/admin/riders', {
    token,
    body: { full_name: 'No Password', mobile_number: uniqueMobile(), email },
  });

  assert.equal(res.status, 400);
  assert.match(res.body?.message || '', /password/i);

  // And nothing was inserted.
  assert.equal(await findRiderByEmail(email), null);
});

test('the create contract is `password`, not the form field `temp_password`', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const email = uniqueEmail();
  // This is the exact body the admin UI used to send before the wrapper mapped
  // the field name — it must not be accepted as a password.
  const res = await call('POST', '/api/admin/riders', {
    token,
    body: {
      full_name: 'Temp Password',
      mobile_number: uniqueMobile(),
      email,
      temp_password: 'secret123',
    },
  });

  assert.equal(res.status, 400);
  assert.equal(await findRiderByEmail(email), null);
});

test('creating a rider with a password yields a usable, sign-in-able account', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const email = uniqueEmail();
  const password = 'ridertest123';
  let riderId = null;
  try {
    const res = await call('POST', '/api/admin/riders', {
      token,
      body: {
        full_name: 'Test Rider',
        mobile_number: uniqueMobile(),
        email,
        password,
      },
    });

    assert.equal(res.status, 201);
    riderId = res.body?.id;
    assert.ok(riderId, 'response should include the new rider id');
    // The hash must never leak in the response.
    assert.equal(res.body?.password_hash, undefined);

    // The stored hash verifies against the supplied password.
    const row = await findRiderByEmail(email);
    assert.ok(row, 'rider row should exist');
    assert.ok(row.password_hash, 'password_hash must be set, not NULL');
    const bcrypt = require('bcrypt');
    assert.equal(await bcrypt.compare(password, row.password_hash), true);

    // And the account can actually sign in through the shared login route.
    const login = await call('POST', '/api/auth/login', { body: { email, password } });
    assert.equal(login.status, 200);
    assert.equal(login.body?.user?.type, 'rider');
    assert.ok(login.body?.accessToken, 'login should return an access token');
  } finally {
    await cleanupRider(riderId);
  }
});
