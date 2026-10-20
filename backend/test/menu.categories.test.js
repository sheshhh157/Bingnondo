/**
 * Tests for the admin menu-category CRUD
 * (`/api/admin/system-settings/menu-categories`).
 *
 * Covered:
 *
 *   1. Create / list / rename / delete round-trip.
 *   2. Validation: empty name, over-long name, duplicate name (409).
 *   3. Delete is blocked (409) while a menu item still references the
 *      category.
 *   4. The surface is admin-only — a cashier token gets a 403.
 *
 * The database-backed tests are skipped when no database is reachable. Every
 * test removes the categories/items/audit rows it created.
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

const uniqueName = (tag) => `zz_test_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;

const deleteCategoryDirect = async (id) => {
  await db.query('DELETE FROM menu_categories WHERE id = $1', [id]);
};

const maxAuditId = async () => {
  const { rows } = await db.query('SELECT COALESCE(MAX(id), 0) AS max FROM audit_log');
  return Number(rows[0].max);
};

const cleanupAuditSince = async (id) => {
  await db.query(
    `DELETE FROM audit_log
     WHERE id > $1 AND action IN ('create_menu_category', 'update_menu_category', 'delete_menu_category')`,
    [id]
  );
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test('category CRUD round-trip', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const auditMark = await maxAuditId();
  let catId = null;
  const name = uniqueName('crud');
  try {
    const created = await call('POST', '/api/admin/system-settings/menu-categories', {
      token,
      body: { name },
    });
    assert.equal(created.status, 201);
    const cat = created.body?.data ?? created.body;
    assert.ok(cat?.id, 'create must return the new id');
    assert.equal(cat.name, name);
    catId = cat.id;

    const list = await call('GET', '/api/admin/system-settings/menu-categories', { token });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.data), 'list must be an array');
    assert.ok(list.body.data.some((c) => c.id === catId && c.name === name));

    const renamed = uniqueName('renamed');
    const patched = await call('PATCH', `/api/admin/system-settings/menu-categories/${catId}`, {
      token,
      body: { name: renamed },
    });
    assert.equal(patched.status, 200);
    const updated = patched.body?.data ?? patched.body;
    assert.equal(updated.name, renamed);

    const removed = await call('DELETE', `/api/admin/system-settings/menu-categories/${catId}`, { token });
    assert.equal(removed.status, 200);
    catId = null;

    const after = await call('GET', '/api/admin/system-settings/menu-categories', { token });
    assert.equal(after.body.data.some((c) => c.name === renamed), false, 'delete must persist');
  } finally {
    if (catId !== null) await deleteCategoryDirect(catId);
    await cleanupAuditSince(auditMark);
  }
});

test('category validation rejects bad input', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const auditMark = await maxAuditId();
  let catId = null;
  try {
    const empty = await call('POST', '/api/admin/system-settings/menu-categories', {
      token,
      body: { name: '   ' },
    });
    assert.equal(empty.status, 400);

    const long = await call('POST', '/api/admin/system-settings/menu-categories', {
      token,
      body: { name: 'x'.repeat(101) },
    });
    assert.equal(long.status, 400);
    assert.match(long.body.message, /100 characters/i);

    const name = uniqueName('dup');
    const first = await call('POST', '/api/admin/system-settings/menu-categories', {
      token,
      body: { name },
    });
    assert.equal(first.status, 201);
    catId = (first.body?.data ?? first.body).id;

    const duplicate = await call('POST', '/api/admin/system-settings/menu-categories', {
      token,
      body: { name: name.toUpperCase() },
    });
    assert.equal(duplicate.status, 409);
  } finally {
    if (catId !== null) await deleteCategoryDirect(catId);
    await cleanupAuditSince(auditMark);
  }
});

test('delete is blocked while a menu item uses the category', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const auditMark = await maxAuditId();
  let catId = null;
  let itemId = null;
  try {
    const created = await call('POST', '/api/admin/system-settings/menu-categories', {
      token,
      body: { name: uniqueName('inuse') },
    });
    assert.equal(created.status, 201);
    catId = (created.body?.data ?? created.body).id;

    const { rows } = await db.query(
      `INSERT INTO menu_items (category_id, name, price) VALUES ($1, $2, 1.00) RETURNING id`,
      [catId, uniqueName('item')]
    );
    itemId = rows[0].id;

    // The list carries the same count the delete guard uses.
    const list = await call('GET', '/api/admin/system-settings/menu-categories', { token });
    const row = list.body.data.find((c) => c.id === catId);
    assert.equal(row?.item_count, 1, 'item_count must count referencing menu items');

    const blocked = await call('DELETE', `/api/admin/system-settings/menu-categories/${catId}`, { token });
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.message, /still use this category/i);

    await db.query('DELETE FROM menu_items WHERE id = $1', [itemId]);
    itemId = null;

    const removed = await call('DELETE', `/api/admin/system-settings/menu-categories/${catId}`, { token });
    assert.equal(removed.status, 200);
    catId = null;
  } finally {
    if (itemId !== null) await db.query('DELETE FROM menu_items WHERE id = $1', [itemId]);
    if (catId !== null) await deleteCategoryDirect(catId);
    await cleanupAuditSince(auditMark);
  }
});

test('the category surface is admin-only', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const admToken = await signInAdmin();
  if (!admToken) return t.skip('no active admin account');

  const token = cashierToken();
  const list = await call('GET', '/api/admin/system-settings/menu-categories', { token });
  assert.equal(list.status, 403);

  const create = await call('POST', '/api/admin/system-settings/menu-categories', {
    token,
    body: { name: uniqueName('denied') },
  });
  assert.equal(create.status, 403);

  const patch = await call('PATCH', '/api/admin/system-settings/menu-categories/1', {
    token,
    body: { name: uniqueName('denied') },
  });
  assert.equal(patch.status, 403);

  const remove = await call('DELETE', '/api/admin/system-settings/menu-categories/1', { token });
  assert.equal(remove.status, 403);
});
