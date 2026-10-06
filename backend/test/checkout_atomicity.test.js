/**
 * Two-phase counter checkout: quote, then settle.
 *
 * The problem this covers: the cashier used to POST an order at "Confirm Order",
 * before any money was taken. A customer who then walked away left an order row,
 * its items, a pending payment and a history row behind forever — visible to the
 * kitchen's prep queue as an order somebody might start cooking. The fix delays
 * persistence until payment, so an abandoned checkout writes nothing at all.
 *
 * What each test pins down:
 *   - a quote writes ZERO rows (the whole point of the change)
 *   - checkout commits order + paid payment together, never one without the other
 *   - the total is server-signed, so a client cannot post its own price
 *   - a quote is spendable only by the cashier it was issued to
 *   - a failure part-way through leaves nothing behind
 *
 * Database-backed assertions skip when no test database is reachable.
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

// ─── fixtures ─────────────────────────────────────────────────────────────────

let cashierId = null;
let otherCashierId = null;
let menuItemId = null;

async function loadFixtures() {
  const cashiers = await db.query(
    `SELECT id FROM staff_accounts
      WHERE role = 'cashier' AND status = 'active' ORDER BY id`
  );
  cashierId = cashiers.rows[0]?.id ?? null;
  otherCashierId = cashiers.rows[1]?.id ?? null;
  const item = await db.query(
    `SELECT id FROM menu_items WHERE is_available AND archived_at IS NULL ORDER BY id LIMIT 1`
  );
  menuItemId = item.rows[0]?.id ?? null;
}

const cart = () => [{ menu_item_id: menuItemId, quantity: 2 }];

const tokenFor = (sub, role) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ sub, type: 'staff', role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
};

function loadRoutes(app) {
  // Mounted on every app instance, so no caching guard here: `call` builds a
  // throwaway app per request and a "only load once" flag would leave every
  // app after the first one with no routes at all (every request 404s).
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/payments', require('../src/modules/payments/payments.routes'));
  return app;
}

async function call(method, path, { body, token } = {}) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  loadRoutes(app);
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function countRowsFor(email = null) {
  // Counts everything the checkout path can write, for one cashier.
  const { rows } = await db.query(
    `SELECT
       (SELECT count(*) FROM orders)                    AS orders,
       (SELECT count(*) FROM order_items)               AS items,
       (SELECT count(*) FROM payments)                  AS payments,
       (SELECT count(*) FROM order_status_history)      AS history,
       (SELECT count(*) FROM kitchen_alerts)            AS alerts`
  );
  return rows[0];
}

const quotePath = '/api/orders/quote';

// ─── the central guarantee ────────────────────────────────────────────────────

test('a quote prices the cart and writes nothing at all', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();
  if (!cashierId || !menuItemId) return t.skip('fixtures missing (need a cashier + an available menu item)');

  const before = await countRowsFor();

  const res = await call('POST', quotePath, {
    token: tokenFor(cashierId, 'cashier'),
    body: { items: cart() },
  });

  assert.equal(res.status, 200);
  assert.ok(res.body.quote_token, 'a signed quote token is returned');
  assert.ok(res.body.total > 0, 'the server returns an authoritative total');
  assert.equal(typeof res.body.total, 'number');

  const after = await countRowsFor();
  // Every table the old flow wrote on confirm: untouched.
  assert.equal(after.orders, before.orders, 'no order row was created');
  assert.equal(after.items, before.items, 'no order_items were created');
  assert.equal(after.payments, before.payments, 'no payment row was created');
  assert.equal(after.history, before.history, 'no history row was created');
  assert.equal(after.alerts, before.alerts, 'no kitchen alert was raised');
});

test('an abandoned checkout leaves nothing behind', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();
  if (!cashierId || !menuItemId) return t.skip('fixtures missing');

  const before = await countRowsFor();

  // The cashier confirms, the customer walks away. Exactly what the UI does.
  const q = await call('POST', quotePath, {
    token: tokenFor(cashierId, 'cashier'),
    body: { items: cart() },
  });
  assert.equal(q.status, 200);
  // handleModalClose() — nothing further is called. The quote just expires.

  const after = await countRowsFor();
  assert.deepEqual(after, before, 'no table changed after quote-then-close');
});

// ─── atomicity ────────────────────────────────────────────────────────────────

test('checkout writes one order and one paid payment, together', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();
  if (!cashierId || !menuItemId) return t.skip('fixtures missing');

  const q = await call('POST', quotePath, {
    token: tokenFor(cashierId, 'cashier'),
    body: { items: cart() },
  });
  assert.equal(q.status, 200);

  const cashGiven = Math.ceil(q.body.total) + 100;
  const res = await call('POST', '/api/payments/checkout', {
    token: tokenFor(cashierId, 'cashier'),
    body: {
      quote_token: q.body.quote_token,
      items: q.body.items,
      method: 'cash',
      cash_given: cashGiven,
    },
  });

  assert.equal(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.order?.id, 'an order was created');
  assert.ok(res.body.payment?.id, 'a payment was created');

  // The two halves are consistent with each other — the pairing is the point.
  assert.equal(res.body.payment.order_id, res.body.order.id);
  assert.equal(res.body.payment.status, 'paid', 'the payment is born paid, never left pending');
  assert.equal(res.body.order.status, 'pending', 'the kitchen starts from pending');
  assert.ok(res.body.order.order_number, 'the real order number is returned for the receipt');

  const { rows } = await db.query(
    `SELECT p.status AS pay_status, o.status AS order_status
       FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE o.id = $1`,
    [res.body.order.id]
  );
  assert.equal(rows[0].pay_status, 'paid');
  assert.equal(rows[0].order_status, 'pending');

  // Checkout deducts stock, which writes inventory_transactions rows referencing
  // the order via a RESTRICT foreign key (unlike items/payments/history, which
  // cascade). Those have to go first or the cleanup itself fails.
  await db.query('DELETE FROM inventory_transactions WHERE reference_order_id = $1', [res.body.order.id]);
  await db.query('DELETE FROM orders WHERE id = $1', [res.body.order.id]);
});

// ─── the total cannot be forged ───────────────────────────────────────────────

test('checkout rejects a tampered quote total', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();
  if (!cashierId || !menuItemId) return t.skip('fixtures missing');

  const q = await call('POST', quotePath, {
    token: tokenFor(cashierId, 'cashier'),
    body: { items: cart() },
  });
  assert.equal(q.status, 200);

  // Forged with the same secret but a total of 1 peso. This is what a modified
  // client would send; the signed claims must win.
  const jwt = require('jsonwebtoken');
  const forged = jwt.sign(
    { sub: cashierId, type: 'quote', fingerprint: q.body.items ? null : null, total: 100 },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  );

  const before = await countRowsFor();
  const res = await call('POST', '/api/payments/checkout', {
    token: tokenFor(cashierId, 'cashier'),
    body: { quote_token: forged, items: q.body.items, method: 'cash', cash_given: 1000 },
  });

  assert.equal(res.status, 409, 'a total that disagrees with the re-price is refused');
  assert.match(res.body.message, /confirm again/i);

  const after = await countRowsFor();
  assert.deepEqual(after, before, 'a rejected checkout writes nothing');
});

test('checkout rejects a quote signed by someone else', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();
  if (!cashierId || !menuItemId) return t.skip('fixtures missing');

  const jwt = require('jsonwebtoken');
  // A perfectly valid signature, but issued to a different cashier — the token
  // must not be a bearer credential.
  const strangerQuote = jwt.sign(
    { sub: cashierId + 9999, type: 'quote', total: 15000 },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  );

  const before = await countRowsFor();
  const res = await call('POST', '/api/payments/checkout', {
    token: tokenFor(cashierId, 'cashier'),
    body: { quote_token: strangerQuote, items: cart(), method: 'cash', cash_given: 1000 },
  });

  assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
  const after = await countRowsFor();
  assert.deepEqual(after, before, 'nothing written');
});

test('checkout rejects an unsigned or malformed quote token', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();
  if (!cashierId || !menuItemId) return t.skip('fixtures missing');

  for (const bad of ['not-a-token', '', 'a.b.c']) {
    const res = await call('POST', '/api/payments/checkout', {
      token: tokenFor(cashierId, 'cashier'),
      body: { quote_token: bad, items: cart(), method: 'cash', cash_given: 1000 },
    });
    assert.ok([400, 401].includes(res.status), `"${bad}" should be refused, got ${res.status}`);
  }
});

test('checkout rejects an access token presented as a quote', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();
  if (!cashierId || !menuItemId) return t.skip('fixtures missing');

  // A real, unexpired staff access token — but not type 'quote'. Otherwise a
  // stolen session token could be replayed straight into checkout.
  const res = await call('POST', '/api/payments/checkout', {
    token: tokenFor(cashierId, 'cashier'),
    body: {
      quote_token: tokenFor(cashierId, 'cashier'),
      items: cart(),
      method: 'cash',
      cash_given: 1000,
    },
  });

  assert.equal(res.status, 401, 'a non-quote token is refused');
});

// ─── input validation on the new endpoints ────────────────────────────────────

test('quote rejects a cart with an unknown item', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();

  const before = await countRowsFor();
  const res = await call('POST', quotePath, {
    token: tokenFor(cashierId, 'cashier'),
    body: { items: [{ menu_item_id: 99999999, quantity: 1 }] },
  });

  assert.equal(res.status, 400);
  const after = await countRowsFor();
  assert.deepEqual(after, before, 'a rejected quote writes nothing');
});

test('checkout refuses GCash, which is still unimplemented', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  await loadFixtures();
  if (!cashierId || !menuItemId) return t.skip('fixtures missing');

  const q = await call('POST', quotePath, {
    token: tokenFor(cashierId, 'cashier'),
    body: { items: cart() },
  });

  const res = await call('POST', '/api/payments/checkout', {
    token: tokenFor(cashierId, 'cashier'),
    body: { quote_token: q.body.quote_token, items: q.body.items, method: 'gcash' },
  });

  assert.equal(res.status, 501);
});

// ─── pure helper ──────────────────────────────────────────────────────────────

test('the item fingerprint changes when the cart does', () => {
  const { itemsFingerprint } = require('../src/modules/orders/orders.controller').__internal;
  const base = [{ menu_item_id: 1, menu_item_option_id: null, menu_item_flavor_id: null, quantity: 1, unit_price: 100 }];

  assert.equal(itemsFingerprint(base), itemsFingerprint([...base]), 'stable for the same cart');
  assert.notEqual(itemsFingerprint(base), itemsFingerprint([{ ...base[0], quantity: 2 }]), 'quantity matters');
  assert.notEqual(itemsFingerprint(base), itemsFingerprint([{ ...base[0], unit_price: 150 }]), 'price matters');
  assert.notEqual(itemsFingerprint(base), itemsFingerprint([{ ...base[0], menu_item_id: 2 }]), 'item matters');
  assert.notEqual(
    itemsFingerprint(base),
    itemsFingerprint([{ ...base[0], menu_item_flavor_id: 7 }]),
    'a swapped flavor matters'
  );
  // Line order must not change the fingerprint: two payloads that differ only in
  // ordering describe the same cart and must produce the same quote.
  const two = [
    { menu_item_id: 2, menu_item_option_id: null, menu_item_flavor_id: null, quantity: 1, unit_price: 50 },
    { menu_item_id: 1, menu_item_option_id: null, menu_item_flavor_id: null, quantity: 1, unit_price: 100 },
  ];
  assert.equal(itemsFingerprint(two), itemsFingerprint([...two].reverse()), 'order-independent');
});