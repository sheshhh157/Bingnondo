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

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/system-settings', require('../src/modules/admin/admin.settings.routes'));
  app.use('/api/esp32', require('../src/modules/kitchen/esp32.routes'));
  return app;
}

async function call(method, path, { body, token, headers = {} } = {}) {
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

async function createDevice(t) {
  const code = `TEST-CFG-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const { rows } = await db.query(
    `INSERT INTO esp32_devices (device_code, location_label)
     VALUES ($1, 'Test Device')
     RETURNING id`,
    [code]
  );
  const id = rows[0].id;
  t.after(async () => {
    await db.query(
      `DELETE FROM audit_log WHERE action = 'update_esp32_wifi_config' AND target_id = $1`,
      [id]
    );
    await db.query('DELETE FROM esp32_devices WHERE id = $1', [id]);
  });
  return { code, id };
}

const deviceHeaders = () => ({ 'x-device-key': process.env.ESP32_DEVICE_KEY || '' });
const adminPath = (code) => `/api/admin/system-settings/esp32-devices/${encodeURIComponent(code)}/wifi`;
const deviceConfigPath = (code, version = 0) =>
  `/api/esp32/config?device_code=${encodeURIComponent(code)}&version=${version}`;

test('admin saves Wi-Fi config and the device fetches and acknowledges it', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');
  if (!process.env.ESP32_DEVICE_KEY) return t.skip('no ESP32_DEVICE_KEY');
  if (!process.env.ESP32_CONFIG_SECRET) return t.skip('no ESP32_CONFIG_SECRET');

  const { code, id } = await createDevice(t);

  const list = await call('GET', '/api/admin/system-settings/esp32-devices', { token });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body?.data));
  assert.ok(list.body.data.some((d) => d.device_code === code));

  const saved = await call('PUT', adminPath(code), {
    token,
    body: {
      ssid: 'KitchenTest',
      password: 'secret123',
      server_url: 'http://10.0.0.5:5000/',
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.version, 1);

  const fetched = await call('GET', deviceConfigPath(code, 0), { headers: deviceHeaders() });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.version, 1);
  assert.equal(fetched.body.ssid, 'KitchenTest');
  assert.equal(fetched.body.password, 'secret123');
  assert.equal(fetched.body.server_url, 'http://10.0.0.5:5000');

  const current = await call('GET', deviceConfigPath(code, 1), { headers: deviceHeaders() });
  assert.equal(current.status, 200);
  assert.equal(current.body.version, 1);
  assert.equal(current.body.password, undefined);

  const ack = await call('POST', '/api/esp32/config/ack', {
    headers: deviceHeaders(),
    body: { device_code: code, version: 1, success: true },
  });
  assert.equal(ack.status, 200);
  assert.equal(ack.body.ok, true);

  const afterAck = await call('GET', '/api/admin/system-settings/esp32-devices', { token });
  const row = afterAck.body.data.find((d) => d.device_code === code);
  assert.equal(Number(row.applied_version), 1);
  assert.equal(row.last_error, null);
  assert.equal(row.ssid, 'KitchenTest');

  const { rows } = await db.query(
    `SELECT password_ciphertext FROM esp32_wifi_configs WHERE device_id = $1`,
    [id]
  );
  assert.ok(rows[0].password_ciphertext.startsWith('v1:'));
  assert.ok(!rows[0].password_ciphertext.includes('secret123'));
});

test('saving the same SSID without a password keeps the stored password', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');
  if (!process.env.ESP32_DEVICE_KEY) return t.skip('no ESP32_DEVICE_KEY');
  if (!process.env.ESP32_CONFIG_SECRET) return t.skip('no ESP32_CONFIG_SECRET');

  const { code } = await createDevice(t);

  await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest', password: 'secret123', server_url: 'http://10.0.0.5:5000' },
  });

  const changed = await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest', server_url: 'http://10.0.0.6:5000' },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.version, 2);

  const fetched = await call('GET', deviceConfigPath(code, 1), { headers: deviceHeaders() });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.version, 2);
  assert.equal(fetched.body.password, 'secret123');
  assert.equal(fetched.body.server_url, 'http://10.0.0.6:5000');

  const renamedWithoutPassword = await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest2', server_url: 'http://10.0.0.6:5000' },
  });
  assert.equal(renamedWithoutPassword.status, 400);
  assert.match(renamedWithoutPassword.body.message, /password/i);
});

test('config validation and failed acknowledgements are recorded', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');
  if (!process.env.ESP32_DEVICE_KEY) return t.skip('no ESP32_DEVICE_KEY');
  if (!process.env.ESP32_CONFIG_SECRET) return t.skip('no ESP32_CONFIG_SECRET');

  const { code } = await createDevice(t);

  const unknown = await call('PUT', adminPath('TEST-NOT-A-DEVICE'), {
    token,
    body: { ssid: 'KitchenTest', password: 'secret123', server_url: 'http://10.0.0.5:5000' },
  });
  assert.equal(unknown.status, 404);

  const badSsid = await call('PUT', adminPath(code), {
    token,
    body: { ssid: '', password: 'secret123', server_url: 'http://10.0.0.5:5000' },
  });
  assert.equal(badSsid.status, 400);

  const badUrl = await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest', password: 'secret123', server_url: 'not-a-url' },
  });
  assert.equal(badUrl.status, 400);

  const shortPassword = await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest', password: 'short', server_url: 'http://10.0.0.5:5000' },
  });
  assert.equal(shortPassword.status, 400);

  const missingPassword = await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest', server_url: 'http://10.0.0.5:5000' },
  });
  assert.equal(missingPassword.status, 400);

  await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest', password: 'secret123', server_url: 'http://10.0.0.5:5000' },
  });

  const failedAck = await call('POST', '/api/esp32/config/ack', {
    headers: deviceHeaders(),
    body: { device_code: code, version: 1, success: false, error: 'wrong password' },
  });
  assert.equal(failedAck.status, 200);

  const list = await call('GET', '/api/admin/system-settings/esp32-devices', { token });
  const row = list.body.data.find((d) => d.device_code === code);
  assert.equal(Number(row.applied_version), 0);
  assert.equal(row.last_error, 'wrong password');

  const badVersion = await call('POST', '/api/esp32/config/ack', {
    headers: deviceHeaders(),
    body: { device_code: code, version: 99, success: true },
  });
  assert.equal(badVersion.status, 404);
});

test('the ESP32 config surface is admin-only and the device key is required', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const forbidden = await call('GET', '/api/admin/system-settings/esp32-devices', {
    token: cashierToken(),
  });
  assert.equal(forbidden.status, 403);

  const noKey = await call('GET', deviceConfigPath('ESP32-KitchenA', 0));
  assert.equal(noKey.status, 401);

  const wrongKey = await call('GET', deviceConfigPath('ESP32-KitchenA', 0), {
    headers: { 'x-device-key': 'wrong-key' },
  });
  assert.equal(wrongKey.status, 401);
});

test('resend bumps config version so the device re-polls', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');
  if (!process.env.ESP32_DEVICE_KEY) return t.skip('no ESP32_DEVICE_KEY');
  if (!process.env.ESP32_CONFIG_SECRET) return t.skip('no ESP32_CONFIG_SECRET');

  const { code } = await createDevice(t);

  await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest', password: 'secret123', server_url: 'http://10.0.0.5:5000' },
  });

  const before = await call('GET', deviceConfigPath(code, 0), { headers: deviceHeaders() });
  assert.equal(before.body.version, 1);

  const resent = await call('PUT', `/api/admin/system-settings/esp32-devices/${encodeURIComponent(code)}/wifi/resend`, {
    token,
  });
  assert.equal(resent.status, 200);
  assert.equal(resent.body.version, 2);

  const after = await call('GET', deviceConfigPath(code, 1), { headers: deviceHeaders() });
  assert.equal(after.body.version, 2);
  assert.equal(after.body.password, 'secret123');
});

test('config history returns audit entries', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');
  if (!process.env.ESP32_DEVICE_KEY) return t.skip('no ESP32_DEVICE_KEY');
  if (!process.env.ESP32_CONFIG_SECRET) return t.skip('no ESP32_CONFIG_SECRET');

  const { code, id } = await createDevice(t);

  await call('PUT', adminPath(code), {
    token,
    body: { ssid: 'KitchenTest', password: 'secret123', server_url: 'http://10.0.0.5:5000' },
  });

  const history = await call('GET', `/api/admin/system-settings/esp32-devices/${encodeURIComponent(code)}/history`, {
    token,
  });
  assert.equal(history.status, 200);
  assert.ok(Array.isArray(history.body?.data));
  assert.ok(history.body.data.length >= 1);
  assert.ok(history.body.data.some((r) => r.action === 'update_esp32_wifi_config'));

  const detail = history.body.data.find((r) => r.action === 'update_esp32_wifi_config');
  assert.ok(detail.details);
  const parsed = typeof detail.details === 'string' ? JSON.parse(detail.details) : detail.details;
  assert.equal(parsed.device_code, code);
});

test('test-connection reports reachability', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');

  const good = await call('POST', '/api/admin/system-settings/esp32-devices/ESP32-KitchenA/test-connection', {
    token,
    body: { server_url: 'http://127.0.0.1:5000' },
  });
  assert.equal(good.status, 200);
  assert.ok(good.body.reachable === true || good.body.reachable === false);
  assert.ok(typeof good.body.status === 'number' || good.body.error);

  const bad = await call('POST', '/api/admin/system-settings/esp32-devices/ESP32-KitchenA/test-connection', {
    token,
    body: { server_url: 'http://192.0.2.1:9999' },
  });
  assert.equal(bad.status, 200);
  assert.equal(bad.body.reachable, false);
  assert.ok(bad.body.error);

  const invalid = await call('POST', '/api/admin/system-settings/esp32-devices/ESP32-KitchenA/test-connection', {
    token,
    body: { server_url: 'not-a-url' },
  });
  assert.equal(invalid.status, 400);
});

test('bulk push updates multiple devices', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const token = await signInAdmin();
  if (!token) return t.skip('no active admin account');
  if (!process.env.ESP32_DEVICE_KEY) return t.skip('no ESP32_DEVICE_KEY');
  if (!process.env.ESP32_CONFIG_SECRET) return t.skip('no ESP32_CONFIG_SECRET');

  const { code: code1 } = await createDevice(t);
  const { code: code2 } = await createDevice(t);

  const bulk = await call('PUT', '/api/admin/system-settings/esp32-devices/wifi/bulk', {
    token,
    body: {
      ssid: 'KitchenBulk',
      password: 'secret123',
      server_url: 'http://10.0.0.5:5000',
      device_codes: [code1, code2],
    },
  });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.body.results.length, 2);
  assert.ok(bulk.body.results.every((r) => r.status === 'ok'));

  const list = await call('GET', '/api/admin/system-settings/esp32-devices', { token });
  const row1 = list.body.data.find((d) => d.device_code === code1);
  const row2 = list.body.data.find((d) => d.device_code === code2);
  assert.equal(row1.ssid, 'KitchenBulk');
  assert.equal(row2.ssid, 'KitchenBulk');
  assert.ok(Number(row1.version) >= 1);
  assert.ok(Number(row2.version) >= 1);
});
