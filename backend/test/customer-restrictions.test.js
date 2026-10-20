/**
 * Tests for the customer restrictions admin module.
 *
 * Covered:
 *
 *   1. GET /api/admin/customer-restrictions lists every customer by default
 *      (clean and flagged alike) with account_status + a summary block.
 *   2. `flagged=1` restores the flagged-only view (AdminOverview depends on it).
 *   3. `account_status` filtering narrows the list to suspended/active accounts.
 *   4. Search matches mobile numbers as well as names/emails.
 *   5. PATCH /:id/account-status suspends and reinstates an account, flips
 *      customers.status, and writes an audit row with from/to/reason.
 *   6. Validation: invalid status and a missing reason are 400s, an unknown
 *      customer is a 404.
 *   7. The whole router is admin-only — a cashier token gets a 403.
 *
 * The database-backed tests are skipped when no database is reachable. Each
 * test creates its own throwaway customers and removes them (together with
 * their restriction rows and audit entries) afterwards, so seeded data is
 * untouched.
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
let adminId = null;

const signInAdmin = async () => {
  if (adminToken) return adminToken;
  const account = await db.query(
    `SELECT id FROM staff_accounts WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1`);
  if (account.rowCount === 0) return null;
  adminId = account.rows[0].id;
  const jwt = require('jsonwebtoken');
  adminToken = jwt.sign(
    { sub: adminId, type: 'staff', role: 'admin' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' },
  );
  return adminToken;
};

const cashierToken = () => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { sub: 999999, type: 'staff', role: 'cashier' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' },
  );
};

/**
 * Bare Express app around the real router. Deliberately not `server.js`:
 * that binds a port, opens Socket.io and installs a startup rate limit.
 */
function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/customer-restrictions', require('../src/modules/admin/customer-restrictions.routes'));
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
const uniqueEmail = (token) => `__cust_test_${token}_${seq++}@example.test`;
const uniqueMobile = (token) => `09${String(token).slice(-7)}${String(seq % 100).padStart(2, '0')}`;

const createCustomer = async ({ email, mobile, status = 'active', firstName = 'Test', lastName = 'Customer' }) => {
  const { rows } = await db.query(
    `INSERT INTO customers (email, password_hash, first_name, last_name, mobile_number, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [email, 'test-hash-not-a-real-password', firstName, lastName, mobile, status]
  );
  return rows[0].id;
};

const flagCustomer = async (customerId, level = 'warned') => {
  await db.query(
    `INSERT INTO customer_restrictions (customer_id, restriction_level, reason, updated_by, updated_at)
     VALUES ($1, $2, 'test violation', $3, NOW())
     ON CONFLICT (customer_id)
       DO UPDATE SET restriction_level = EXCLUDED.restriction_level, reason = EXCLUDED.reason,
                     updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
    [customerId, level, adminId]
  );
};

const getCustomer = async (id) => {
  const { rows } = await db.query(`SELECT status FROM customers WHERE id = $1`, [id]);
  return rows[0] || null;
};

const auditRowsFor = async (customerId) => {
  const { rows } = await db.query(
    `SELECT action, details FROM audit_log
      WHERE target_type = 'customer' AND target_id = $1
      ORDER BY id DESC`,
    [customerId]
  );
  return rows;
};

// Remove the customers together with every row the handlers wrote for them,
// so the tables are left exactly as found.
const cleanupCustomers = async (ids) => {
  const list = ids.filter(Boolean);
  if (!list.length) return;
  await db.query(`DELETE FROM customer_restrictions WHERE customer_id = ANY($1::int[])`, [list]);
  await db.query(`DELETE FROM audit_log WHERE target_type = 'customer' AND target_id = ANY($1::int[])`, [list]);
  await db.query(`DELETE FROM customers WHERE id = ANY($1::int[])`, [list]);
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test('the default list includes clean customers, flags, and a global summary', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const run = Date.now();
  const ids = [];
  try {
    const cleanId = await createCustomer({ email: uniqueEmail(run), mobile: uniqueMobile(run) });
    ids.push(cleanId);
    const flaggedId = await createCustomer({ email: uniqueEmail(run), mobile: uniqueMobile(run) });
    ids.push(flaggedId);
    await flagCustomer(flaggedId);

    const res = await call('GET', `/api/admin/customer-restrictions?search=${run}&limit=50`, { token });
    assert.equal(res.status, 200);

    const rows = res.body?.data || [];
    const clean = rows.find((r) => r.customer_id === cleanId);
    const flagged = rows.find((r) => r.customer_id === flaggedId);

    assert.ok(clean, 'clean customer must appear in the default list');
    assert.equal(clean.account_status, 'active');
    assert.equal(clean.restriction_level, 'none');

    assert.ok(flagged, 'flagged customer must appear');
    assert.equal(flagged.restriction_level, 'warned');
    assert.equal(flagged.total_violations, 0);

    assert.ok(res.body?.summary, 'response must include a summary block');
    assert.ok(res.body.summary.total_customers >= 2);
    assert.ok(res.body.summary.flagged >= 1);
    assert.ok(res.body.summary.warned >= 1);
  } finally {
    await cleanupCustomers(ids);
  }
});

test('flagged=1 hides customers without violations or restrictions', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const run = Date.now();
  const ids = [];
  try {
    const cleanId = await createCustomer({ email: uniqueEmail(run), mobile: uniqueMobile(run) });
    ids.push(cleanId);
    const flaggedId = await createCustomer({ email: uniqueEmail(run), mobile: uniqueMobile(run) });
    ids.push(flaggedId);
    await flagCustomer(flaggedId);

    const res = await call('GET', `/api/admin/customer-restrictions?search=${run}&flagged=1&limit=50`, { token });
    assert.equal(res.status, 200);

    const rows = res.body?.data || [];
    assert.equal(rows.find((r) => r.customer_id === cleanId), undefined);
    assert.ok(rows.find((r) => r.customer_id === flaggedId));
  } finally {
    await cleanupCustomers(ids);
  }
});

test('account_status filtering narrows the list to suspended or active accounts', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const run = Date.now();
  const ids = [];
  try {
    const activeId = await createCustomer({ email: uniqueEmail(run), mobile: uniqueMobile(run) });
    ids.push(activeId);
    const suspendedId = await createCustomer({ email: uniqueEmail(run), mobile: uniqueMobile(run), status: 'suspended' });
    ids.push(suspendedId);

    const suspendedRes = await call('GET', `/api/admin/customer-restrictions?search=${run}&account_status=suspended&limit=50`, { token });
    assert.equal(suspendedRes.status, 200);
    const suspendedRows = suspendedRes.body?.data || [];
    assert.ok(suspendedRows.find((r) => r.customer_id === suspendedId));
    assert.equal(suspendedRows.find((r) => r.customer_id === activeId), undefined);

    const activeRes = await call('GET', `/api/admin/customer-restrictions?search=${run}&account_status=active&limit=50`, { token });
    const activeRows = activeRes.body?.data || [];
    assert.ok(activeRows.find((r) => r.customer_id === activeId));
    assert.equal(activeRows.find((r) => r.customer_id === suspendedId), undefined);
  } finally {
    await cleanupCustomers(ids);
  }
});

test('search matches mobile numbers', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const run = Date.now();
  const ids = [];
  try {
    const mobile = uniqueMobile(run);
    const id = await createCustomer({ email: uniqueEmail(run), mobile });
    ids.push(id);

    const res = await call('GET', `/api/admin/customer-restrictions?search=${mobile}`, { token });
    assert.equal(res.status, 200);
    const rows = res.body?.data || [];
    assert.ok(rows.find((r) => r.customer_id === id), 'searching by mobile must find the customer');
  } finally {
    await cleanupCustomers(ids);
  }
});

test('suspend flips the account to suspended and writes an audit row; reinstate turns it back', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const run = Date.now();
  const ids = [];
  try {
    const id = await createCustomer({ email: uniqueEmail(run), mobile: uniqueMobile(run) });
    ids.push(id);

    const suspend = await call('PATCH', `/api/admin/customer-restrictions/${id}/account-status`, {
      token,
      body: { status: 'suspended', reason: 'repeated no-shows' },
    });
    assert.equal(suspend.status, 200);
    assert.equal((await getCustomer(id)).status, 'suspended');

    let audits = await auditRowsFor(id);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'customer_account_status_change');
    assert.equal(audits[0].details.from_status, 'active');
    assert.equal(audits[0].details.to_status, 'suspended');
    assert.equal(audits[0].details.reason, 'repeated no-shows');

    const reinstate = await call('PATCH', `/api/admin/customer-restrictions/${id}/account-status`, {
      token,
      body: { status: 'active', reason: 'appeal accepted' },
    });
    assert.equal(reinstate.status, 200);
    assert.equal((await getCustomer(id)).status, 'active');

    audits = await auditRowsFor(id);
    assert.equal(audits.length, 2);
    assert.equal(audits[0].details.from_status, 'suspended');
    assert.equal(audits[0].details.to_status, 'active');
  } finally {
    await cleanupCustomers(ids);
  }
});

test('account-status validation: bad status, missing reason, unknown customer', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const run = Date.now();
  const ids = [];
  try {
    const id = await createCustomer({ email: uniqueEmail(run), mobile: uniqueMobile(run) });
    ids.push(id);

    const badStatus = await call('PATCH', `/api/admin/customer-restrictions/${id}/account-status`, {
      token,
      body: { status: 'awaiting_verification', reason: 'sneaky' },
    });
    assert.equal(badStatus.status, 400);
    assert.match(badStatus.body?.message || '', /status must be one of/i);
    assert.equal((await getCustomer(id)).status, 'active');

    const noReason = await call('PATCH', `/api/admin/customer-restrictions/${id}/account-status`, {
      token,
      body: { status: 'suspended' },
    });
    assert.equal(noReason.status, 400);
    assert.match(noReason.body?.message || '', /reason/i);
    assert.equal((await getCustomer(id)).status, 'active');

    const unknown = await call('PATCH', '/api/admin/customer-restrictions/2147480000/account-status', {
      token,
      body: { status: 'suspended', reason: 'ghost' },
    });
    assert.equal(unknown.status, 404);
  } finally {
    await cleanupCustomers(ids);
  }
});

test('a non-admin token is refused with 403', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const admToken = await signInAdmin();
  if (!admToken) return t.skip('no active admin account');

  const res = await call('GET', '/api/admin/customer-restrictions', { token: cashierToken() });
  assert.equal(res.status, 403);

  const patch = await call('PATCH', '/api/admin/customer-restrictions/1/account-status', {
    token: cashierToken(),
    body: { status: 'suspended', reason: 'nope' },
  });
  assert.equal(patch.status, 403);
});
