/**
 * Tests for the admin notification feed + notification settings.
 *
 * Covered:
 *
 *   1. GET /api/admin/notifications returns a shaped, newest-first page and
 *      clamps `limit` to the 50-row maximum.
 *   2. `categories=` narrows the feed, and a category disabled in System
 *      Settings disappears from the default feed.
 *   3. POST /seen clears the unread count (a freshly written audit row makes
 *      the feed unread first).
 *   4. GET/PUT /api/admin/system-settings/notifications round-trips and
 *      rejects missing keys, unknown keys, and non-boolean values.
 *   5. The whole surface is admin-only — a cashier token gets a 403.
 *
 * The database-backed tests are skipped when no database is reachable. Every
 * test snapshots and restores system_settings + the admin's notification
 * marker, and removes the audit rows it created, so seeded data is untouched.
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
 * Bare Express app around the real routers. Deliberately not `server.js`:
 * that binds a port, opens Socket.io and installs a startup rate limit.
 */
function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/notifications', require('../src/modules/admin/admin.notifications.routes'));
  app.use('/api/admin/system-settings', require('../src/modules/admin/admin.settings.routes'));
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

const ALL_CATEGORIES = ['orders', 'payments', 'deliveries', 'inventory', 'kitchen', 'customers', 'system'];

const fullCategories = (overrides = {}) =>
  Object.fromEntries(ALL_CATEGORIES.map((c) => [c, overrides[c] ?? true]));

const snapshotSettings = async () => {
  const { rows } = await db.query(`SELECT value FROM system_settings WHERE key = 'notifications'`);
  return rows[0]?.value ?? null;
};

const restoreSettings = async (value) => {
  if (value === null) {
    await db.query(`DELETE FROM system_settings WHERE key = 'notifications'`);
    return;
  }
  await db.query(
    `UPDATE system_settings SET value = $1::jsonb, updated_at = NOW() WHERE key = 'notifications'`,
    [JSON.stringify(value)]
  );
};

const forceCategory = async (category, enabled) => {
  await db.query(
    `UPDATE system_settings
     SET value = jsonb_set(value, ARRAY['categories', $1], $2::jsonb)
     WHERE key = 'notifications'`,
    [category, JSON.stringify(enabled)]
  );
};

const adminSeenAt = async () => {
  const { rows } = await db.query(
    `SELECT notification_seen_at FROM staff_accounts WHERE id = $1`, [adminId]);
  return rows[0]?.notification_seen_at ?? null;
};

const setAdminSeenAt = async (value) => {
  await db.query(
    `UPDATE staff_accounts SET notification_seen_at = $1 WHERE id = $2`, [value, adminId]);
};

const maxAuditId = async () => {
  const { rows } = await db.query('SELECT COALESCE(MAX(id), 0) AS max FROM audit_log');
  return Number(rows[0].max);
};

const cleanupAuditSince = async (id) => {
  await db.query(
    `DELETE FROM audit_log WHERE id > $1 AND action = 'update_notification_settings'`, [id]);
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test('the feed is a shaped, newest-first page and clamps limit', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const res = await call('GET', '/api/admin/notifications?limit=5', { token });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body?.data), 'data must be an array');
  assert.ok(res.body.data.length <= 5);
  assert.equal(typeof res.body.unread, 'number');
  assert.ok('lastSeenAt' in res.body);

  for (let i = 1; i < res.body.data.length; i++) {
    assert.ok(
      new Date(res.body.data[i - 1].at) >= new Date(res.body.data[i].at),
      'items must be sorted newest first'
    );
  }
  for (const item of res.body.data) {
    assert.equal(typeof item.id, 'string');
    assert.equal(typeof item.title, 'string');
    assert.ok(ALL_CATEGORIES.includes(item.category), `unknown category: ${item.category}`);
  }

  const capped = await call('GET', '/api/admin/notifications?limit=999', { token });
  assert.equal(capped.status, 200);
  assert.ok(capped.body.data.length <= 50, 'limit must be clamped to 50');
});

test('category filter narrows the feed and disabled categories are excluded', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const filtered = await call('GET', '/api/admin/notifications?categories=orders', { token });
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.data.every((e) => e.category === 'orders'));

  const settingsBefore = await snapshotSettings();
  try {
    await forceCategory('orders', false);
    const off = await call('GET', '/api/admin/notifications', { token });
    assert.equal(off.status, 200);
    assert.equal(off.body.data.find((e) => e.category === 'orders'), undefined);
  } finally {
    await restoreSettings(settingsBefore);
  }
});

test('marking seen clears the unread count', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const settingsBefore = await snapshotSettings();
  const seenBefore = await adminSeenAt();
  let auditId = null;
  try {
    await forceCategory('system', true);
    await setAdminSeenAt(new Date(Date.now() - 60 * 60 * 1000));

    const { rows } = await db.query(
      `INSERT INTO audit_log (actor_id, action, target_type, details, created_at)
       VALUES (NULL, 'test_notifications_feed', 'test', '{}'::jsonb, NOW())
       RETURNING id`);
    auditId = rows[0].id;

    const before = await call('GET', '/api/admin/notifications', { token });
    assert.equal(before.status, 200);
    assert.ok(before.body.unread >= 1, 'fresh audit row must count as unread');
    const mine = before.body.data.find((e) => e.id === `audit-${auditId}`);
    assert.ok(mine, 'the fresh audit row must appear in the feed');

    const seen = await call('POST', '/api/admin/notifications/seen', { token });
    assert.equal(seen.status, 200);
    assert.ok(seen.body?.data?.lastSeenAt, 'seen must return the new marker');

    const after = await call('GET', '/api/admin/notifications', { token });
    assert.equal(after.body.unread, 0);
  } finally {
    if (auditId !== null) await db.query('DELETE FROM audit_log WHERE id = $1', [auditId]);
    await setAdminSeenAt(seenBefore);
    await restoreSettings(settingsBefore);
  }
});

test('notification settings round-trip and validate', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const settingsBefore = await snapshotSettings();
  const auditMark = await maxAuditId();
  try {
    const get = await call('GET', '/api/admin/system-settings/notifications', { token });
    assert.equal(get.status, 200);
    assert.deepEqual(Object.keys(get.body.data.categories).sort(), [...ALL_CATEGORIES].sort());

    const missing = await call('PUT', '/api/admin/system-settings/notifications', {
      token,
      body: { categories: { orders: true } },
    });
    assert.equal(missing.status, 400);
    assert.match(missing.body.message, /Missing notification categories/i);

    const unknown = await call('PUT', '/api/admin/system-settings/notifications', {
      token,
      body: { categories: { ...fullCategories(), extra: true } },
    });
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.message, /Unknown notification categories/i);

    const notBool = await call('PUT', '/api/admin/system-settings/notifications', {
      token,
      body: { categories: { ...fullCategories(), orders: 'yes' } },
    });
    assert.equal(notBool.status, 400);
    assert.match(notBool.body.message, /true or false/i);

    const save = await call('PUT', '/api/admin/system-settings/notifications', {
      token,
      body: { categories: fullCategories({ kitchen: false }) },
    });
    assert.equal(save.status, 200);
    assert.equal(save.body.data.categories.kitchen, false);

    const after = await call('GET', '/api/admin/system-settings/notifications', { token });
    assert.equal(after.body.data.categories.kitchen, false, 'save must persist');
  } finally {
    await restoreSettings(settingsBefore);
    await cleanupAuditSince(auditMark);
  }
});

test('the notification surface is admin-only', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const admToken = await signInAdmin();
  if (!admToken) return t.skip('no active admin account');

  const token = cashierToken();
  const feed = await call('GET', '/api/admin/notifications', { token });
  assert.equal(feed.status, 403);

  const seen = await call('POST', '/api/admin/notifications/seen', { token });
  assert.equal(seen.status, 403);

  const getSettings = await call('GET', '/api/admin/system-settings/notifications', { token });
  assert.equal(getSettings.status, 403);

  const putSettings = await call('PUT', '/api/admin/system-settings/notifications', {
    token,
    body: { categories: fullCategories() },
  });
  assert.equal(putSettings.status, 403);
});
