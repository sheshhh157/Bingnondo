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

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/esp32', require('../src/modules/kitchen/esp32.routes'));
  return app;
}

async function call(method, path, { body, headers = {} } = {}) {
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
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

const deviceHeaders = () => ({ 'x-device-key': process.env.ESP32_DEVICE_KEY || '' });

test('alert feed shows order details and keeps the acknowledged order visible', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!process.env.ESP32_DEVICE_KEY) return t.skip('no ESP32_DEVICE_KEY');

  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const code = `TEST-ALERT-${suffix}`;
  const dev = await db.query(
    `INSERT INTO esp32_devices (device_code, location_label) VALUES ($1, 'Test Device') RETURNING id`,
    [code]
  );
  const deviceId = dev.rows[0].id;

  let orderId = null;
  let itemId = null;
  let alertId = null;
  t.after(async () => {
    if (alertId) await db.query('DELETE FROM kitchen_alerts WHERE id = $1', [alertId]);
    if (orderId) await db.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
    if (orderId) await db.query('DELETE FROM orders WHERE id = $1', [orderId]);
    if (itemId) await db.query('DELETE FROM menu_items WHERE id = $1', [itemId]);
    await db.query('DELETE FROM esp32_devices WHERE id = $1', [deviceId]);
  });

  const cat = await db.query('SELECT id FROM menu_categories ORDER BY id LIMIT 1');
  if (cat.rowCount === 0) return t.skip('no menu category');

  const item = await db.query(
    `INSERT INTO menu_items (category_id, name, price) VALUES ($1, $2, 10) RETURNING id`,
    [cat.rows[0].id, `__esp32_${Math.floor(Math.random() * 10000)}`]
  );
  itemId = item.rows[0].id;

  const order = await db.query(
    `INSERT INTO orders (order_type, status, order_channel, total_amount, special_request)
     VALUES ('counter', 'pending', 'web_counter', 20, 'No onions') RETURNING id`
  );
  orderId = order.rows[0].id;

  await db.query(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes, variant_name)
     VALUES ($1, $2, 2, 10, 'Extra sauce', 'Large')`,
    [orderId, itemId]
  );

  const alert = await db.query(
    `INSERT INTO kitchen_alerts (order_id, device_id, triggered_at)
     VALUES ($1, $2, NOW()) RETURNING id`,
    [orderId, deviceId]
  );
  alertId = alert.rows[0].id;

  const path = `/api/esp32/alert?device_code=${encodeURIComponent(code)}`;
  const waiting = await call('GET', path, { headers: deviceHeaders() });
  assert.equal(waiting.status, 200);
  assert.equal(waiting.body.pending, 1);
  assert.equal(waiting.body.alert_id, alertId);
  assert.equal(waiting.body.orders[0], `ORD-${String(orderId).padStart(4, '0')}`);
  assert.equal(waiting.body.display.acknowledged, false);
  assert.equal(waiting.body.display.alert_id, alertId);
  assert.equal(waiting.body.display.order_number, waiting.body.orders[0]);
  assert.equal(waiting.body.display.special_request, 'No onions');
  assert.equal(waiting.body.display.items.length, 1);
  assert.equal(waiting.body.display.items[0].qty, 2);
  assert.match(waiting.body.display.items[0].name, /Large/);
  assert.equal(waiting.body.display.items[0].notes, 'Extra sauce');

  const acked = await call('POST', '/api/esp32/ack', {
    headers: deviceHeaders(),
    body: { device_code: code, alert_id: alertId },
  });
  assert.equal(acked.status, 200);

  const afterAck = await call('GET', path, { headers: deviceHeaders() });
  assert.equal(afterAck.status, 200);
  assert.equal(afterAck.body.pending, 0);
  assert.equal(afterAck.body.display.acknowledged, true);
  assert.equal(afterAck.body.display.order_number, waiting.body.orders[0]);
  assert.equal(afterAck.body.display.items.length, 1);

  const webAck = await db.query(
    `UPDATE kitchen_alerts SET acknowledged_at = NOW() WHERE id = $1 RETURNING id`,
    [alertId]
  );
  assert.equal(webAck.rowCount, 1);
  const afterWebAck = await call('GET', path, { headers: deviceHeaders() });
  assert.equal(afterWebAck.body.pending, 0);
  assert.equal(afterWebAck.body.display.acknowledged, true);
});
