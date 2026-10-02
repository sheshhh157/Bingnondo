/**
 * Money integrity and per-cashier isolation on the order write paths.
 *
 * Covered:
 *
 *   1. Editing an order's items AFTER the cash was taken is refused. The
 *      cashier normally settles at the counter while the order is still
 *      'pending' (the kitchen acknowledging it is what moves it to
 *      'confirmed'), so 'pending' never meant "unpaid". The edit used to be
 *      allowed, which rewrote `orders.total_amount` while `payments.amount`
 *      kept the figure actually collected — and revenue sums
 *      `orders.total_amount`, so one edit inflated the till by the
 *      difference. Measured live before the fix: PHP 80 collected reported
 *      as PHP 630.
 *
 *   2. A cashier cannot pay, cancel, re-price or read ANOTHER cashier's
 *      order. The read paths already scoped by `cashier_id`
 *      (`buildOrderFilters`, `getOrderTotals`) but no write path did, so in a
 *      two-till cafe either cashier could settle the other's order — and then
 *      the victim could not even see it, because the list hid it from them.
 *
 *   3. An order with no payment row is reported as such, not as a missing
 *      order. The handler used to INNER JOIN `payments`, so such an order was
 *      permanently unpayable and reported "Order not found."
 *
 * Database-backed tests are skipped when no database is reachable.
 * Each test creates its own throwaway order and deletes it afterwards; it does
 * NOT wrap the test in a transaction, because the handlers check out their own
 * pooled connection and COMMIT outside it.
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

const jwt = require('jsonwebtoken');

/** The real cashier account, so "their own order" has a concrete owner. */
const cashierAccount = async () =>
  (await db.query(
    `SELECT id FROM staff_accounts WHERE role = 'cashier' AND status = 'active' ORDER BY id LIMIT 1`
  )).rows[0];

const signFor = (sub, role) =>
  jwt.sign({ sub, type: 'staff', role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/payments', require('../src/modules/payments/payments.routes'));
  return app;
}

async function call(method, path, { body, tok } = {}) {
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tok}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

/** A throwaway order owned by `cashierId`, with one item and one payment row. */
const withOrder = async ({ cashierId, payment = 'pending', items = 1 }, fn) => {
  const created = await db.query(
    `INSERT INTO orders (order_type, status, order_channel, total_amount, cashier_id)
     VALUES ('counter', 'pending', 'web_counter', 100, $1) RETURNING id`,
    [cashierId]);
  const id = created.rows[0].id;
  const menuItem = (await db.query(
    `SELECT id, price FROM menu_items ORDER BY id LIMIT 1`)).rows[0];
  for (let i = 0; i < items; i++) {
    await db.query(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
       VALUES ($1, $2, 1, $3)`, [id, menuItem.id, menuItem.price]);
  }
  if (payment !== 'none') {
    await db.query(
      `INSERT INTO payments (order_id, method, amount, status)
       VALUES ($1, 'cash', 100, $2)`, [id, payment]);
  }
  try {
    return await fn(id);
  } finally {
    await db.query(`DELETE FROM orders WHERE id = $1`, [id]);
  }
};

const totalsOf = async (id) =>
  (await db.query(
    `SELECT o.total_amount AS order_total, p.amount AS payment_amount
     FROM orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1`, [id])).rows[0];

// ─── Editing an order the money has already been taken for ────────────────────

test('editing items after payment is refused, so the till cannot be inflated', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const cashier = await cashierAccount();
  if (!cashier) return t.skip('no active cashier account');
  const tok = signFor(cashier.id, 'cashier');

  await withOrder({ cashierId: cashier.id, payment: 'paid' }, async (id) => {
    const before = await totalsOf(id);

    // An edit that would more than triple the order's value.
    const menuItems = (await db.query(
      `SELECT id FROM menu_items ORDER BY id LIMIT 2`)).rows;

    const res = await call('PATCH', `/api/orders/${id}/items`, {
      tok,
      body: { items: [{ menu_item_id: menuItems[0].id, quantity: 1 },
                      { menu_item_id: menuItems[1].id, quantity: 5 }] },
    });

    assert.equal(res.status, 409, 'editing a paid order must be refused');
    assert.match(res.body.message, /payment has already been collected/i);

    const after = await totalsOf(id);
    assert.equal(Number(after.order_total), Number(before.order_total),
      'order total must be unchanged');
    assert.equal(Number(after.order_total), Number(after.payment_amount),
      'order total must still match the money actually collected');
  });
});

test('an unpaid pending order can still be edited', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const cashier = await cashierAccount();
  if (!cashier) return t.skip('no active cashier account');
  const tok = signFor(cashier.id, 'cashier');

  await withOrder({ cashierId: cashier.id, payment: 'pending' }, async (id) => {
    const item = (await db.query(`SELECT id FROM menu_items ORDER BY id LIMIT 1`)).rows[0];

    const res = await call('PATCH', `/api/orders/${id}/items`, {
      tok,
      body: { items: [{ menu_item_id: item.id, quantity: 3 }] },
    });

    assert.equal(res.status, 200, 'editing an unpaid order must still work');
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].quantity, 3);
  });
});

// ─── One cashier cannot touch another's order ─────────────────────────────────

test("a cashier cannot pay another cashier's order", async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const cashier = await cashierAccount();
  if (!cashier) return t.skip('no active cashier account');
  const intruder = signFor(cashier.id + 9999, 'cashier');

  await withOrder({ cashierId: cashier.id, payment: 'pending' }, async (id) => {
    const res = await call('POST', '/api/payments', {
      tok: intruder,
      body: { order_id: id, method: 'cash', cash_given: 1000 },
    });

    assert.equal(res.status, 403, "paying someone else's order must be refused");
    assert.match(res.body.message, /your own orders/i);

    const still = (await db.query(
      `SELECT status FROM payments WHERE order_id = $1`, [id])).rows[0];
    assert.equal(still.status, 'pending', 'the payment must not have been recorded');
  });
});

test("a cashier cannot cancel or re-price another cashier's order", async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const cashier = await cashierAccount();
  if (!cashier) return t.skip('no active cashier account');
  const intruder = signFor(cashier.id + 9999, 'cashier');

  await withOrder({ cashierId: cashier.id, payment: 'pending' }, async (id) => {
    const item = (await db.query(`SELECT id FROM menu_items ORDER BY id LIMIT 1`)).rows[0];

    const cancel = await call('POST', `/api/orders/${id}/cancel`, { tok: intruder });
    assert.equal(cancel.status, 403, "cancelling someone else's order must be refused");

    const edit = await call('PATCH', `/api/orders/${id}/items`, {
      tok: intruder,
      body: { items: [{ menu_item_id: item.id, quantity: 7 }] },
    });
    assert.equal(edit.status, 403, "re-pricing someone else's order must be refused");

    const status = await call('PATCH', `/api/orders/${id}/status`, {
      tok: intruder, body: { status: 'preparing' },
    });
    assert.equal(status.status, 403, "advancing someone else's order must be refused");
  });
});

test("a supervisor override can still act across the shop", async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const cashier = await cashierAccount();
  if (!cashier) return t.skip('no active cashier account');
  const owner = (await db.query(
    `SELECT id FROM staff_accounts WHERE role = 'owner' AND status = 'active' ORDER BY id LIMIT 1`
  )).rows[0];
  if (!owner) return t.skip('no active owner account');
  const ownerTok = signFor(owner.id, 'owner');

  // The owner is not the cashier who owns the order, yet must still be able to
  // settle it — otherwise a supervisor cannot cover a till.
  await withOrder({ cashierId: cashier.id, payment: 'pending' }, async (id) => {
    const res = await call('POST', '/api/payments', {
      tok: ownerTok,
      body: { order_id: id, method: 'cash', cash_given: 1000 },
    });
    assert.equal(res.status, 200, 'owner override must still work');
  });
});

// ─── An order with no payment row ─────────────────────────────────────────────

test('an order with no payment row reports that, not "Order not found"', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const cashier = await cashierAccount();
  if (!cashier) return t.skip('no active cashier account');
  const tok = signFor(cashier.id, 'cashier');

  await withOrder({ cashierId: cashier.id, payment: 'none' }, async (id) => {
    const res = await call('POST', '/api/payments', {
      tok,
      body: { order_id: id, method: 'cash', cash_given: 1000 },
    });

    assert.notEqual(res.status, 404, 'the order does exist; 404 would be a lie');
    assert.equal(res.status, 409);
    assert.match(res.body.message, /no payment record/i);
  });
});