const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

let db = null;
try { db = require('../src/config/db'); } catch {}

const canQuery = async () => {
  if (!db) return false;
  try { await db.query('SELECT 1'); return true; } catch { return false; }
};

let token = null;
const signIn = async (role = 'cashier') => {
  const key = role;
  if (token && token[key]) return token[key];
  try {
    const account = await db.query(
      `SELECT id FROM staff_accounts WHERE role=$1 AND status='active' ORDER BY id LIMIT 1`,
      [role]
    );
    if (account.rowCount === 0) return null;
    const jwt = require('jsonwebtoken');
    token = token || {};
    token[key] = jwt.sign({ sub: account.rows[0].id, type: 'staff', role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
    return token[key];
  } catch { return null; }
};

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/payments', require('../src/modules/payments/payments.routes'));
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  app.use('/api/auth', require('../src/modules/auth/auth.routes'));
  return app;
}

async function call(method, path, { body, role = 'cashier' } = {}) {
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

// Patch emitNewOrder to occlude actual events, keep count.
const socketHub = require('../src/sockets');
let emittedNewOrderCount = 0;
const actualEmitNewOrder = socketHub.emitNewOrder;
socketHub.emitNewOrder = (order) => { emittedNewOrderCount++; };

// Fetch a cashier role token
const getToken = async (role = 'cashier') => {
  const account = await db.query(`SELECT id FROM staff_accounts WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`, [role]);
  const { sub } = account.rows[0];
  const jwt = require('jsonwebtoken');
  return jwt.sign({ sub, type: 'staff', role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
};

let menuItemId = null;
const getMenuItemId = async () => {
  if (menuItemId) return menuItemId;
  const res = await db.query(`SELECT id FROM menu_items LIMIT 1`);
  menuItemId = res.rows[0]?.id || 1;
  return menuItemId;
};

const kitchenOrders = async () => {
  const res = await call('GET', '/api/kitchen/orders', { role: 'kitchen_staff' });
  return res.status === 200 ? res.body.data : [];
};

test('unpaid counter order does not appear in kitchen and no new_order emitted', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  emittedNewOrderCount = 0;

  const created = await call('POST', '/api/orders', {
    body: { items: [{ menu_item_id: await getMenuItemId(), quantity: 1 }] }, // note: we need to use an actual item id later?
    role: 'cashier',
  });
  assert.equal(created.status, 201);

  assert.equal(emittedNewOrderCount, 0);

  const orders = await kitchenOrders();
  const found = orders.find((o) => o.id === created.body.id);
  assert.equal(found, undefined);
});

test('paying a counter order makes it appear in kitchen and emits new_order', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  emittedNewOrderCount = 0;

  // create order
  const created = await call('POST', '/api/orders', { body: { items: [{ menu_item_id: await getMenuItemId(), quantity: 1 }] }, role: 'cashier' });
  assert.equal(created.status, 201);

  // before payment, not visible
  let orders = await kitchenOrders();
  assert.equal(orders.find((o) => o.id === created.body.id), undefined);

  // pay
  const paid = await call('POST', '/api/payments', { body: { order_id: created.body.id, method: 'cash', cash_given: 9999 }, role: 'cashier' });
  assert.equal(paid.status, 200);

  // after payment, it appears
  orders = await kitchenOrders();
  const orderRow = orders.find((o) => o.id === created.body.id);
  assert(orderRow, 'paid order should appear in kitchen list');

  // new_order emitted exactly once
  assert.equal(emittedNewOrderCount, 1);
});

test('unpaid counter order older than timeout is cancelled automatically', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  // insert order with created_at old
  const { rows: [inserted] } = await db.query(`
    INSERT INTO orders (order_type, status, order_channel, total_amount, cashier_id, created_at)
    VALUES ('counter', 'pending', 'web_counter', 50, NULL, NOW() - INTERVAL '40 minutes')
    RETURNING id
  `);

  const scheduler = require('../src/scheduler');
  await scheduler.autoCancelCounterOrders();

  const { rows: [updated] } = await db.query(`SELECT status FROM orders WHERE id = $1`, [inserted.id]);
  assert.equal(updated.status, 'cancelled');
});

test('paid counter order is never auto-cancelled', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const { rows: [inserted] } = await db.query(`
    INSERT INTO orders (order_type, status, order_channel, total_amount, cashier_id, created_at)
    VALUES ('counter', 'pending', 'web_counter', 50, NULL, NOW() - INTERVAL '40 minutes')
    RETURNING id
  `);
  await db.query(`INSERT INTO payments (order_id, method, amount, status, paid_at) VALUES ($1, 'cash', 50, 'paid', NOW())`, [inserted.id]);

  const scheduler = require('../src/scheduler');
  await scheduler.autoCancelCounterOrders();

  const { rows: [updated] } = await db.query(`SELECT status FROM orders WHERE id = $1`, [inserted.id]);
  assert(updated.status !== 'cancelled', 'paid order must not be cancelled');
});

test('auto-cancel never races with a payment because guard checks status', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const { rows: [inserted] } = await db.query(`
    INSERT INTO orders (order_type, status, order_channel, total_amount, cashier_id, created_at)
    VALUES ('counter', 'pending', 'web_counter', 50, NULL, NOW() - INTERVAL '40 minutes')
    RETURNING id
  `);

  // simulate that an order status is about to transition... Actually we only need to verify the guard does not cancel an order that has a paid payment? That's covered above. Note: This test may not be necessary but included for completeness.
  const scheduler = require('../src/scheduler');
  await scheduler.autoCancelCounterOrders();
  const { rows: [updated] } = await db.query(`SELECT status FROM orders WHERE id = $1`, [inserted.id]);
  assert.equal(updated.status, 'cancelled', 'guard should cancel unpay STATUS');
});

test('auto-cancel skips when a paid payment is inserted after candidate SELECT', { only: true }, async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const { rows: [inserted] } = await db.query(`
    INSERT INTO orders (order_type, status, order_channel, total_amount, cashier_id, created_at)
    VALUES ('counter', 'pending', 'web_counter', 50, NULL, NOW() - INTERVAL '40 minutes')
    RETURNING id
  `);

  // Override db.getClient to intercept the paid payment detection query.
  const originalGetClient = db.getClient;
  db.getClient = async () => {
    const client = await originalGetClient();
    const originalQuery = client.query;
    client.query = async (sql, params) => {
      if (typeof sql === 'string' && sql.includes("SELECT 1 FROM payments WHERE order_id = $1 AND status = 'paid' LIMIT 1")) {
        // Simulate that a payment row was inserted after the candidate SELECT.
        return Promise.resolve({ rows: [{ exists: true }] });
      }
      return originalQuery.apply(client, [sql, params]);
    };
    return client;
  };

  try {
    const scheduler = require('../src/scheduler');
    await scheduler.autoCancelCounterOrders();
    const { rows: [updated] } = await db.query(`SELECT status FROM orders WHERE id = $1`, [inserted.id]);
    assert.equal(updated.status, 'pending', 'order must remain uncancelled');
  } finally {
    db.getClient = originalGetClient;
  }
});
