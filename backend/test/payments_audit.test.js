const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

let db = null;
try {
  db = require('../src/config/db');
} catch {}

const canQuery = async () => {
  if (!db) return false;
  try { await db.query('SELECT 1'); return true; } catch { return false; }
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
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/payments', require('../src/modules/payments/payments.routes'));
  app.use('/api/menu', require('../src/modules/menu/menu.routes'));
  app.use('/api/auth', require('../src/modules/auth/auth.routes'));
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

async function priceCart(items) {
  const { priceCart } = require('../src/services/pricing.service');
  return priceCart(items);
}

test('pricing works with integer centavos', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const itemA = (await db.query(`SELECT id, name, price FROM menu_items LIMIT 1`)).rows[0];
  // create a custom item with price 0.1 and 0.2
  const cat = (await db.query(`SELECT id FROM menu_categories LIMIT 1`)).rows[0];
  await db.query(
    `INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES ($1, 'CentA', '', 0.1, true)`,
    [cat.id]
  );
  await db.query(
    `INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES ($1, 'CentB', '', 0.2, true)`,
    [cat.id]
  );
  const a = (await db.query(`SELECT id, price FROM menu_items WHERE name='CentA'`)).rows[0];
  const b = (await db.query(`SELECT id, price FROM menu_items WHERE name='CentB'`)).rows[0];

  const res = await priceCart([{ menu_item_id: a.id, quantity: 1 }, { menu_item_id: b.id, quantity: 1 }]);
  assert.equal(Number(res.totalAmount), 0.3);
});

test('3 x 19.99 totals 59.97', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const cat = (await db.query(`SELECT id FROM menu_categories LIMIT 1`)).rows[0];
  await db.query(
    `INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES ($1, 'Exact19', '', 19.99, true)`,
    [cat.id]
  );
  const item = (await db.query(`SELECT id, price FROM menu_items WHERE name='Exact19'`)).rows[0];
  const res = await priceCart([{ menu_item_id: item.id, quantity: 3 }]);
  assert.equal(Number(res.totalAmount), 59.97);
});

test('report totals equal sum of paid payments', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  // clean test data
  await db.query(`DELETE FROM inventory_transactions`);
  await db.query(`DELETE FROM orders WHERE id IS NOT NULL`);
  await db.query(`DELETE FROM payments WHERE id IS NOT NULL`);
  await db.query(`DELETE FROM audit_log WHERE id IS NOT NULL`);

  const [o1] = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 100) RETURNING id`)).rows;
  const [o2] = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 200) RETURNING id`)).rows;
  await db.query(`INSERT INTO payments (order_id, method, amount, status, paid_at) VALUES ($1, 'cash', 100, 'paid', NOW())`, [o1.id]);
  await db.query(`INSERT INTO payments (order_id, method, amount, status, paid_at) VALUES ($1, 'cash', 150, 'pending', NULL)`, [o2.id]);

  const res = await call('GET', '/api/orders/totals', {});
  assert.equal(res.body.total_revenue, 100);
  assert.equal(res.body.collected_orders, 1);
});

test('changing item price does not change past report totals', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const cat = (await db.query(`SELECT id FROM menu_categories LIMIT 1`)).rows[0];
  await db.query(
    `INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES ($1, 'Hist99', '', 10, true)`,
    [cat.id]
  );
  const item = (await db.query(`SELECT id, price FROM menu_items WHERE name='Hist99'`)).rows[0];
  const [o1] = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 10) RETURNING id`)).rows;
  await db.query(`INSERT INTO payments (order_id, method, amount, status, paid_at) VALUES ($1, 'cash', 10, 'paid', NOW())`, [o1.id]);

  // report before price change
  const before = await call('GET', '/api/orders/totals', {});
  const beforeValue = before.body.total_revenue;

  // change price
  await db.query(`UPDATE menu_items SET price = 20 WHERE id = $1`, [item.id]);

  const after = await call('GET', '/api/orders/totals', {});
  assert.equal(after.body.total_revenue, beforeValue);
});

test('change_given matches payment', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  // create order with payment pending
  const [order] = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 30) RETURNING id`)).rows;
  await db.query(`INSERT INTO payments (order_id, method, amount, status) VALUES ($1, 'cash', 30, 'pending')`, [order.id]);

  const paid = await call('POST', '/api/payments', { body: { order_id: order.id, method: 'cash', cash_given: 50 }, role: 'cashier' });
  assert.equal(paid.status, 200);
  const p = paid.body.payment;
  assert.equal(p.cash_given, '50.00');
  assert.equal(p.change_given, '20.00');
});

test('audit log signals payment and order cancellation', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const [order] = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 100) RETURNING id`)).rows;
  await db.query(`INSERT INTO payments (order_id, method, amount, status) VALUES ($1, 'cash', 100, 'pending')`, [order.id]);
  await call('POST', '/api/payments', { body: { order_id: order.id, method: 'cash', cash_given: 100 }, role: 'cashier' });

  const r1 = (await db.query(`SELECT COUNT(*) as c FROM audit_log WHERE action = 'payment_paid'`)).rows[0].c;
  assert(Number(r1) >= 1);

  // order should be pending with status changed
  const [order2] = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 50) RETURNING id`)).rows;
  await db.query(`INSERT INTO payments (order_id, method, amount, status) VALUES ($1, 'cash', 50, 'pending')`, [order2.id]);
  await call('POST', `/api/orders/${order2.id}/cancel`, { role: 'cashier' });
  const r2 = (await db.query(`SELECT COUNT(*) as c FROM audit_log WHERE action = 'order_cancelled'`)).rows[0].c;
  assert(Number(r2) >= 1);
});

test('audit log written on menu item price change and availability toggle', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const [item] = (await db.query(`INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES (1, 'AuditTest', '', 30, true) RETURNING id`)).rows;

  const setPrice = await call('PUT', `/api/menu/${item.id}`, { body: { price: 35 }, role: 'owner' });
  assert.equal(setPrice.status, 200);
  const r3 = (await db.query(`SELECT * FROM audit_log WHERE action = 'menu_item_price_changed' AND target_id = $1`, [item.id])).rows;
  assert(r3.length >= 1);

  const setAvail = await call('PATCH', `/api/menu/${item.id}/availability`, { body: { is_available: false }, role: 'owner' });
  assert.equal(setAvail.status, 200);
  const r4 = (await db.query(`SELECT * FROM audit_log WHERE action = 'menu_availability_toggled' AND target_id = $1`, [item.id])).rows;
  assert(r4.length >= 1);
});

test('failed staff login writes audit log', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const res = await call('POST', '/api/auth/staff/login', { body: { email: 'nosuch@example.com', password: 'wrong' } });
  assert.equal(res.status, 401);
  const r5 = (await db.query(`SELECT * FROM audit_log WHERE action = 'staff_login_failed'`)).rows;
  assert(r5.length >= 1);
});

test('payment at 23:30 Manila time lands in that day bucket', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  // create order/payment
  const cat = (await db.query(`SELECT id FROM menu_categories LIMIT 1`)).rows[0];
  const item = (await db.query(`INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES ($1, 'TZTestItem', '', 5, true) RETURNING id`, [cat.id])).rows[0];
  const order = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 5) RETURNING id`)).rows[0];
  await db.query(`INSERT INTO payments (order_id, method, amount, status, paid_at) VALUES ($1, 'cash', 5, 'paid', '2026-10-04 23:30:00')`, [order.id]);
  await db.query(`INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES ($1, $2, 1, 5)`, [order.id, item.id]);

  const res = await call('GET', '/api/orders/report?tz=Asia/Manila', { role: 'owner' });
  const daily = res.body.daily;
  const day = daily.find((d) => d.day === '2026-10-04');
  assert(day, 'expected 2026-10-04 to be in daily buckets');

  // cleanup
  await db.query(`DELETE FROM payments WHERE order_id = $1`, [order.id]);
  await db.query(`DELETE FROM order_items WHERE menu_item_id = $1`, [item.id]);
  await db.query(`DELETE FROM orders WHERE id = $1`, [order.id]);
  await db.query(`DELETE FROM menu_items WHERE name = 'TZTestItem'`);
  await db.query(`DELETE FROM menu_categories WHERE name = ''`); // noop
});

test('payment succeeds even when audit insert fails', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const [order] = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 100) RETURNING id`)).rows;
  await db.query(`INSERT INTO payments (order_id, method, amount, status) VALUES ($1, 'cash', 100, 'pending')`, [order.id]);

  const origQuery = db.query;
  db.query = async (sql, params) => {
    if (sql.includes("INSERT INTO audit_log") && sql.includes('payment_paid')) {
      throw new Error('forced audit insert error');
    }
    return origQuery(sql, params);
  };
  try {
    const paid = await call('POST', '/api/payments', { body: { order_id: order.id, method: 'cash', cash_given: 100 }, role: 'cashier' });
    assert.equal(paid.status, 200);
  } finally {
    db.query = origQuery;
  }

  const pay = (await db.query(`SELECT status FROM payments WHERE order_id = $1`, [order.id])).rows[0];
  assert.equal(pay.status, 'paid');
});

test('failed login does not break when audit insert fails', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const origQuery = db.query;
  db.query = async (sql, params) => {
    if (sql.includes('INSERT INTO audit_log')) {
      throw new Error('forced audit insert error');
    }
    return origQuery(sql, params);
  };
  try {
    const res = await call('POST', '/api/auth/staff/login', { body: { email: 'nosuch@example.com', password: 'wrong' } });
    assert.equal(res.status, 401);
  } finally {
    db.query = origQuery;
  }
});

test('payment rejected for auto-cancelled order', async (t) => {
  if (!(await canQuery())) return t.skip('no database');

  const [order] = (await db.query(`INSERT INTO orders (order_type, status, order_channel, total_amount) VALUES ('counter', 'pending', 'web_counter', 100) RETURNING id`)).rows;
  await db.query(`INSERT INTO payments (order_id, method, amount, status) VALUES ($1, 'cash', 100, 'pending')`, [order.id]);
  await db.query(`UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [order.id]);

  const paid = await call('POST', '/api/payments', { body: { order_id: order.id, method: 'cash', cash_given: 100 }, role: 'cashier' });
  assert.equal(paid.status, 409);
  assert.match(paid.body.message, /cancelled/i);
});


