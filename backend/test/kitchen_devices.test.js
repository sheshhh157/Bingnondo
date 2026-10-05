/**
 * GET /api/kitchen/devices must report the live ESP32 registry correctly.
 *
 * Covered:
 *   1. online:true when last_ping_at is within 15 seconds.
 *   2. online:false when last_ping_at is older than 15 seconds.
 *   3. 401 without a staff token.
 *   4. kitchen_staff may read the list.
 *
 * The `online` column is computed in SQL (NOW() - last_ping_at); the test
 * must not rely on a JS-side clock.
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

let token = null;
const signIn = async (role = 'owner') => {
  const key = role;
  if (token && token[key]) return token[key];
  const account = await db.query(
    `SELECT id FROM staff_accounts WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`,
    [role]);
  if (account.rowCount === 0) return null;
  const jwt = require('jsonwebtoken');
  token = token || {};
  token[key] = jwt.sign(
    { sub: account.rows[0].id, type: 'staff', role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' },
  );
  return token[key];
};

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  return app;
}

async function call(path, { role = 'owner' } = {}) {
  const jwtToken = role ? await signIn(role) : null;
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const headers = {};
    if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

// ─── /api/kitchen/devices ───────────────────────────────────────────────────────

test('GET /api/kitchen/devices returns online:true when last_ping_at is recent', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Insert a device whose heartbeat just happened.
  const ins = await db.query(
    `INSERT INTO esp32_devices (device_code, location_label, last_ping_at)
     VALUES ($1, 'Test Online', NOW()) RETURNING id`,
    [`test-device-online-${Date.now()}`]);
  const id = ins.rows[0].id;

  try {
    const res = await call('/api/kitchen/devices', { role: 'owner' });
    assert.equal(res.status, 200);
    const dev = res.body.find((d) => d.id === id);
    assert(dev, 'inserted device should appear in the list');
    assert.equal(dev.online, true);
  } finally {
    await db.query('DELETE FROM esp32_devices WHERE id = $1', [id]);
  }
});

test('GET /api/kitchen/devices returns online:false when last_ping_at is stale', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const ins = await db.query(
    `INSERT INTO esp32_devices (device_code, location_label, last_ping_at)
     VALUES ($1, 'Test Stale', NOW() - INTERVAL '20 seconds') RETURNING id`,
    [`test-device-stale-${Date.now()}`]);
  const id = ins.rows[0].id;

  try {
    const res = await call('/api/kitchen/devices', { role: 'owner' });
    assert.equal(res.status, 200);
    const dev = res.body.find((d) => d.id === id);
    assert(dev, 'inserted device should appear in the list');
    assert.equal(dev.online, false);
  } finally {
    await db.query('DELETE FROM esp32_devices WHERE id = $1', [id]);
  }
});

test('GET /api/kitchen/devices returns 401 without a staff token', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const res = await call('/api/kitchen/devices', { role: null });
  assert.equal(res.status, 401);
});

test('GET /api/kitchen/devices allows kitchen_staff', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const res = await call('/api/kitchen/devices', { role: 'kitchen_staff' });
  assert.equal(res.status, 200);
  assert(Array.isArray(res.body));
});
