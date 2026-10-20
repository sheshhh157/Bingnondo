/**
 * Tests for the admin variant-group CRUD
 * (`/api/admin/system-settings/variants`).
 *
 * A variant group is now just a name plus a maximum option count — option
 * names and prices live on each menu item (see menu.category-variants.test.js).
 *
 * Covered:
 *
 *   1. Create / list / update (rename + change max) / delete round-trip.
 *   2. Validation: missing name, over-long name, duplicate name (409),
 *      missing/non-integer/out-of-range max_options (400).
 *   3. The surface is admin-only — a cashier token gets a 403.
 *
 * The database-backed tests are skipped when no database is reachable. Every
 * test removes the variant groups/audit rows it created.
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

const uniqueName = (tag) => `zz_var_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;

const deleteGroupDirect = async (id) => {
  await db.query('DELETE FROM variant_groups WHERE id = $1', [id]);
};

const maxAuditId = async () => {
  const { rows } = await db.query('SELECT COALESCE(MAX(id), 0) AS max FROM audit_log');
  return Number(rows[0].max);
};

const cleanupAuditSince = async (id) => {
  await db.query(
    `DELETE FROM audit_log
     WHERE id > $1 AND action IN ('create_variant_group', 'update_variant_group', 'delete_variant_group')`,
    [id]
  );
};

// ─── Tests ────────────────────────────────────────────────────────────────────

test('variant group CRUD round-trip', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const auditMark = await maxAuditId();
  let groupId = null;
  const name = uniqueName('crud');
  try {
    const created = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name, max_options: 2 },
    });
    assert.equal(created.status, 201);
    const group = created.body?.data ?? created.body;
    assert.ok(group?.id, 'create must return the new id');
    assert.equal(group.name, name);
    assert.equal(group.max_options, 2);
    assert.equal(group.options, undefined, 'groups no longer carry options');
    groupId = group.id;

    const list = await call('GET', '/api/admin/system-settings/variants', { token });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.data), 'list must be an array');
    const listed = list.body.data.find(g => g.id === groupId);
    assert.ok(listed, 'created group must appear on the list');
    assert.equal(listed.max_options, 2);

    // Update: rename and raise the max.
    const renamed = uniqueName('renamed');
    const patched = await call('PATCH', `/api/admin/system-settings/variants/${groupId}`, {
      token,
      body: { name: renamed, max_options: 5 },
    });
    assert.equal(patched.status, 200);
    const updated = patched.body?.data ?? patched.body;
    assert.equal(updated.name, renamed);
    assert.equal(updated.max_options, 5);

    const removed = await call('DELETE', `/api/admin/system-settings/variants/${groupId}`, { token });
    assert.equal(removed.status, 200);
    groupId = null;

    const after = await call('GET', '/api/admin/system-settings/variants', { token });
    assert.equal(after.body.data.some(g => g.name === renamed), false, 'delete must persist');
  } finally {
    if (groupId !== null) await deleteGroupDirect(groupId);
    await cleanupAuditSince(auditMark);
  }
});

test('variant group validation rejects bad input', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const auditMark = await maxAuditId();
  let groupId = null;
  try {
    const noName = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name: '   ', max_options: 3 },
    });
    assert.equal(noName.status, 400);
    assert.match(noName.body.message, /name is required/i);

    const longName = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name: 'x'.repeat(101), max_options: 3 },
    });
    assert.equal(longName.status, 400);
    assert.match(longName.body.message, /100 characters/i);

    const base = uniqueName('valid');
    const missingMax = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name: base },
    });
    assert.equal(missingMax.status, 400);
    assert.match(missingMax.body.message, /max options/i);

    const zeroMax = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name: base, max_options: 0 },
    });
    assert.equal(zeroMax.status, 400);
    assert.match(zeroMax.body.message, /max options/i);

    const tooBig = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name: base, max_options: 11 },
    });
    assert.equal(tooBig.status, 400);
    assert.match(tooBig.body.message, /max options/i);

    const fractional = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name: base, max_options: 2.5 },
    });
    assert.equal(fractional.status, 400);
    assert.match(fractional.body.message, /max options/i);

    const first = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name: base, max_options: 3 },
    });
    assert.equal(first.status, 201);
    groupId = (first.body?.data ?? first.body).id;

    const dupeName = await call('POST', '/api/admin/system-settings/variants', {
      token,
      body: { name: base.toUpperCase(), max_options: 3 },
    });
    assert.equal(dupeName.status, 409);

    const selfRename = await call('PATCH', `/api/admin/system-settings/variants/${groupId}`, {
      token,
      body: { name: base.toUpperCase(), max_options: 4 },
    });
    assert.equal(selfRename.status, 200, 'a group may keep its own name (case-insensitively)');
    assert.equal((selfRename.body?.data ?? selfRename.body).max_options, 4);
  } finally {
    if (groupId !== null) await deleteGroupDirect(groupId);
    await cleanupAuditSince(auditMark);
  }
});

test('the variant surface is admin-only', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const admToken = await signInAdmin();
  if (!admToken) return t.skip('no active admin account');

  const token = cashierToken();
  const list = await call('GET', '/api/admin/system-settings/variants', { token });
  assert.equal(list.status, 403);

  const create = await call('POST', '/api/admin/system-settings/variants', {
    token,
    body: { name: uniqueName('denied'), max_options: 3 },
  });
  assert.equal(create.status, 403);

  const patch = await call('PATCH', '/api/admin/system-settings/variants/1', {
    token,
    body: { name: uniqueName('denied'), max_options: 3 },
  });
  assert.equal(patch.status, 403);

  const remove = await call('DELETE', '/api/admin/system-settings/variants/1', { token });
  assert.equal(remove.status, 403);
});
