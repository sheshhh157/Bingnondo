/**
 * Counter orders finish in one step: when the kitchen marks them ready they
 * go ready -> completed inside the same transaction. Online orders must keep
 * the ready -> out_for_delivery -> completed flow (i.e. stay 'ready').
 *
 * Covered:
 *   1. Paid counter order marked ready ends as 'completed', with order_status_history
 *      rows for both 'ready' and 'completed', in order, changed_by = kitchen user.
 *   2. The 'order:status' events (ready then completed) and 'order:ready' are emitted.
 *   3. An online order marked ready stays 'ready' (one history row, no completed event).
 *   4. An invalid transition (pending -> ready) still returns 409.
 *   5. Revenue figures include the order before and after (ready -> completed).
 *   6. A second 'ready' request on the completed order is a 409 no-op, so it
 *      writes no duplicate history.
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
const signIn = async (role = 'kitchen_staff') => {
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

async function staffId(role) {
  const tokenKey = role;
  // decode the exp/sub from the token we just signed
  const t = await signIn(role);
  const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString());
  return payload.sub;
}

const events = [];
const fakeIo = {
  to: () => fakeIo,
  use: () => {},
  on: () => {},
  emit: (name, payload) => events.push({ name, payload }),
};

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/payments', require('../src/modules/payments/payments.routes'));
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  return app;
}

async function call(method, path, { body, role = 'kitchen_staff' } = {}) {
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

async function makeOrder({ orderType, status }) {
  const cashier = await db.query(
    `SELECT id FROM staff_accounts WHERE role='cashier' AND status='active' ORDER BY id LIMIT 1`);
  const cashierId = cashier.rows[0].id;
  const { rows } = await db.query(
    `INSERT INTO orders (order_type, order_channel, status, cashier_id, total_amount)
     VALUES ($1, 'web_counter', $2, $3, 100) RETURNING id`,
    [orderType, status, cashierId]);
  return rows[0].id;
}

async function makePaid(orderId) {
  await db.query(
    `INSERT INTO payments (order_id, method, amount, status, paid_at)
     VALUES ($1, 'cash', 100, 'paid', NOW())`,
    [orderId]);
}

async function cleanup(ids) {
  if (!ids || ids.length === 0) return;
  await db.query(`DELETE FROM order_status_history WHERE order_id = ANY($1::int[])`, [ids]);
  await db.query(`DELETE FROM payments WHERE order_id = ANY($1::int[])`, [ids]);
  await db.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [ids]);
}

async function revTotal() {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(p.amount),0)::float AS rev
     FROM orders o JOIN payments p ON p.order_id = o.id
     WHERE p.status='paid' AND o.status <> 'cancelled'`);
  return rows[0].rev;
}

test('counter order marked ready ends completed with two history rows + emits events', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const sockets = require('../src/sockets');
  sockets.setIO(fakeIo);
  events.length = 0;

  const id = await makeOrder({ orderType: 'counter', status: 'preparing' });
  await makePaid(id);
  const kitchenUid = await staffId('kitchen_staff');

  const before = await revTotal();
  const res = await call('PATCH', `/api/kitchen/orders/${id}/status`, { body: { status: 'ready' }, role: 'kitchen_staff' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'completed');

  const { rows: hist } = await db.query(
    `SELECT status, changed_by FROM order_status_history WHERE order_id = $1 ORDER BY id`, [id]);
  assert.deepEqual(hist.map((r) => r.status), ['ready', 'completed']);
  assert.equal(hist[0].changed_by, kitchenUid);
  assert.equal(hist[1].changed_by, kitchenUid);

  const names = events.map((e) => e.name);
  assert.ok(names.includes('order:status'), 'expected order:status event, got ' + JSON.stringify(names));
  assert.ok(names.includes('order:ready'), 'expected order:ready event, got ' + JSON.stringify(names));
  const statusPayloads = events.filter((e) => e.name === 'order:status').map((e) => e.payload.status);
  assert.deepEqual(statusPayloads, ['ready', 'completed']);

  const after = await revTotal();
  assert.equal(after, before, 'revenue total must not change when ready -> completed');

  // A second ready request on the completed order is a 409 no-op, no new history.
  const res2 = await call('PATCH', `/api/kitchen/orders/${id}/status`, { body: { status: 'ready' }, role: 'kitchen_staff' });
  assert.equal(res2.status, 409);
  const { rows: hist2 } = await db.query(`SELECT count(*)::int AS n FROM order_status_history WHERE order_id = $1`, [id]);
  assert.equal(hist2[0].n, 2);

  await cleanup([id]);
});

test('online order marked ready stays ready', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const sockets = require('../src/sockets');
  sockets.setIO(fakeIo);
  events.length = 0;

  const id = await makeOrder({ orderType: 'online', status: 'preparing' });
  await makePaid(id);

  const res = await call('PATCH', `/api/kitchen/orders/${id}/status`, { body: { status: 'ready' }, role: 'kitchen_staff' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'ready');

  const { rows: hist } = await db.query(
    `SELECT status FROM order_status_history WHERE order_id = $1 ORDER BY id`, [id]);
  assert.deepEqual(hist.map((r) => r.status), ['ready']);

  const statusPayloads = events.filter((e) => e.name === 'order:status').map((e) => e.payload.status);
  assert.deepEqual(statusPayloads, ['ready']);
  assert.ok(!events.some((e) => e.name === 'order:status' && e.payload.status === 'completed'));

  await cleanup([id]);
});

test('invalid transition still returns 409 (pending -> ready)', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  const id = await makeOrder({ orderType: 'counter', status: 'pending' });
  const res = await call('PATCH', `/api/kitchen/orders/${id}/status`, { body: { status: 'ready' }, role: 'kitchen_staff' });
  assert.equal(res.status, 409);
  const { rows } = await db.query(`SELECT status FROM orders WHERE id=$1`, [id]);
  assert.equal(rows[0].status, 'pending');
  await cleanup([id]);
});
