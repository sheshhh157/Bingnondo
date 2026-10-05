/**
 * The ESP32 buzzer must ring on exactly one event: a successful payment.
 *
 * Covered:
 *
 *   1. `POST /api/orders` (cashier "Confirm Order") opens NO kitchen alert.
 *   2. `POST /api/payments` ("Mark Paid") opens exactly ONE alert.
 *   3. `PATCH /api/kitchen/orders/:id/acknowledge` closes it again, so the
 *      ESP32's poll stops reporting `buzz: true`.
 *   4. Paying twice is refused, so it cannot open a second alert.
 *
 * Why this needs asserting: `createOrder` used to INSERT into `kitchen_alerts`
 * alongside the payment handler. Confirm Order therefore rang the physical
 * buzzer before any money was taken, and under migration 005's partial unique
 * index (`one unacknowledged alert per order`) the later payment INSERT
 * collided, so marking an order paid could 500 with a unique violation.
 *
 * Nothing else catches this: the schema happily accepts an alert for an
 * unpaid order, and the kitchen page only reacts to socket events, so the
 * defect was invisible until someone stood next to the buzzer.
 *
 * Database-backed tests are skipped when no database is reachable.
 *
 * Each test creates its own throwaway order and deletes it afterwards. It does
 * NOT wrap the test in a transaction — the handlers check out their own pooled
 * connection and COMMIT outside it, so a rollback would not undo them.
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

/**
 * Bare Express app around the real routers.
 *
 * Deliberately not `server.js`: that binds a port and opens a Socket.io server,
 * neither of which these tests need.
 */
function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/payments', require('../src/modules/payments/payments.routes'));
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  return app;
}

async function call(method, path, { body, role = 'owner' } = {}) {
  const jwtToken = await signIn(role);
  if (!jwtToken) return { status: 0, body: null };
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const confirmOrder = async () => {
  const item = (await db.query(
    `SELECT id FROM menu_items WHERE is_available ORDER BY id LIMIT 1`)).rows[0];
  return call('POST', '/api/orders', {
    body: { items: [{ menu_item_id: item.id, quantity: 1 }] },
    role: 'cashier',
  });
};

const markPaid = (id) => call('POST', '/api/payments', {
  body: { order_id: id, method: 'cash', cash_given: 999999 },
  role: 'cashier',
});

const acknowledge = (id) => call('PATCH', `/api/kitchen/orders/${id}/acknowledge`, {
  role: 'kitchen_staff',
});

/** Unacknowledged alerts for an order — what the ESP32 poll counts as `buzz`. */
const openAlerts = async (orderId) =>
  (await db.query(
    `SELECT COUNT(*)::int AS n FROM kitchen_alerts
      WHERE order_id = $1 AND acknowledged_at IS NULL`,
    [orderId])).rows[0].n;

/**
 * Run `fn` against a real Confirm Order, then remove it.
 * `order_items`, `order_status_history`, `payments` and `kitchen_alerts` all
 * cascade on `orders.id`, so the table is left as found.
 */
const withConfirmedOrder = async (fn) => {
  const created = await confirmOrder();
  assert.equal(created.status, 201, `Confirm Order failed: ${JSON.stringify(created.body)}`);
  const id = created.body.id;
  try {
    return await fn(id);
  } finally {
    await db.query('DELETE FROM inventory_transactions WHERE reference_order_id = $1', [id]);
    await db.query('DELETE FROM orders WHERE id = $1', [id]);
  }
};

// ─── The paid-only rule ───────────────────────────────────────────────────────

test('Confirm Order opens no alert and rings nothing', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withConfirmedOrder(async (id) => {
    assert.equal(
      await openAlerts(id), 0,
      'creating an order must not ring the buzzer — only a payment may');
  });
});

test('Mark Paid opens exactly one alert', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withConfirmedOrder(async (id) => {
    const paid = await markPaid(id);
    assert.equal(paid.status, 200, `Mark Paid failed: ${JSON.stringify(paid.body)}`);

    assert.equal(
      await openAlerts(id), 1,
      'paying must ring the buzzer exactly once');
  });
});

test('Acknowledge silences the alert for the ESP32', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withConfirmedOrder(async (id) => {
    await markPaid(id);
    assert.equal(await openAlerts(id), 1, 'precondition: one open alert');

    const res = await acknowledge(id);
    assert.equal(res.status, 200, `Acknowledge failed: ${JSON.stringify(res.body)}`);

    assert.equal(
      await openAlerts(id), 0,
      'acknowledging must leave the ESP32 with nothing to buzz about');
  });
});

test('paying an already-paid order is refused, so it cannot ring twice', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withConfirmedOrder(async (id) => {
    assert.equal((await markPaid(id)).status, 200);
    const second = await markPaid(id);

    assert.equal(second.status, 409, 'a second payment must be refused');
    assert.equal(
      await openAlerts(id), 1,
      'the refused payment must not have opened a second alert');
  });
});

test('cash_on_delivery on a counter order is refused, online COD accepted', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Counter order (POS flow): COD must be refused, else the line books a sale
  // no money backs.
  await withConfirmedOrder(async (id) => {
    const res = await call('POST', '/api/payments', {
      body: { order_id: id, method: 'cash_on_delivery' },
      role: 'cashier',
    });
    assert.equal(res.status, 400, `counter + cash_on_delivery must be refused, got ${JSON.stringify(res.body)}`);
    assert.match(res.body.message, /counter orders can only be paid with cash/i);
    assert.equal(await openAlerts(id), 0, 'a refused COD payment must not ring the buzzer');
  });

  // Same method is legitimate when the order is online.
  const online = await db.query(
    `INSERT INTO orders (order_type, status, order_channel, total_amount)
     VALUES ('online', 'confirmed', 'web_online', 100) RETURNING id`
  );
  const onlineId = online.rows[0].id;
  try {
    await db.query(
      `INSERT INTO payments (order_id, method, amount, status) VALUES ($1, 'cash_on_delivery', 100, 'pending')`,
      [onlineId]
    );
    const res = await call('POST', '/api/payments', {
      body: { order_id: onlineId, method: 'cash_on_delivery' },
      role: 'cashier',
    });
    assert.equal(res.status, 200, `online + cash_on_delivery should be accepted, got ${JSON.stringify(res.body)}`);
    assert.equal((await db.query('SELECT status FROM payments WHERE order_id = $1', [onlineId])).rows[0].status, 'paid');
  } finally {
    await db.query('DELETE FROM orders WHERE id = $1', [onlineId]);
  }
});

test('Acknowledge is idempotent — a repeat tap never 409s', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withConfirmedOrder(async (id) => {
    await markPaid(id);

    const first = await acknowledge(id);
    const second = await acknowledge(id);

    assert.equal(first.status, 200);
    assert.equal(
      second.status, 200,
      'a retried tap must still succeed — a 409 left the buzzer unstoppable');
    assert.equal(await openAlerts(id), 0);
  });
});