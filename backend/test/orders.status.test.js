/**
 * Tests for order status transitions and the payment/cancellation guards.
 *
 * Covered:
 *
 *   1. The transition map itself — which from -> to pairs are legal.
 *   2. `PATCH /api/orders/:id/status` enforcing that map over HTTP.
 *   3. The kitchen endpoint still permitting exactly the chain it always did.
 *   4. `POST /api/orders/:id/cancel` refusing a paid order.
 *   5. `POST /api/payments` refusing a cancelled order.
 *
 * Why this needs asserting: the two endpoints that mutate `orders.status`
 * previously disagreed. The kitchen hand-enforced `confirmed -> preparing ->
 * ready` while `PATCH /api/orders/:id/status` validated nothing, so it accepted
 * `ready -> pending` and any other jump. Nothing in the schema catches that.
 * The kitchen regression tests in particular matter because KitchenPage is the
 * only live consumer of status changes and its error handler only
 * console.errors — a wrongly-rejected transition would freeze a button with no
 * message shown.
 *
 * The database-backed tests are skipped when no database is reachable.
 *
 * Each mutating test works on its own throwaway order and deletes it afterwards.
 * It does NOT wrap the test in a transaction: the handlers open their own pooled
 * connection and commit outside it, so a rollback would not undo them. See
 * `withTestOrder` below for the full reason.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const { TRANSITIONS, ALL_STATUSES, isKnownStatus, canTransition, canTransitionAs } =
  require('../src/modules/orders/status-transitions');

// ─── The transition map ───────────────────────────────────────────────────────

test('every status the orders_status_check allows is in the map', () => {
  // The map is the definition of "legal" now. If the database ever accepts a
  // status the map omits, `canTransition` would silently reject it.
  const checkConstraint = [
    'pending', 'confirmed', 'preparing', 'ready',
    'out_for_delivery', 'completed', 'cancelled',
  ];
  assert.deepEqual([...ALL_STATUSES].sort(), [...checkConstraint].sort());
});

test('cancellation is only allowed before cooking starts', () => {
  // Once an order is 'preparing' the food is committed. Voiding it is a
  // business decision, not a technical one, so the map stays restrictive.
  for (const from of ['pending', 'confirmed']) {
    assert.ok(canTransition(from, 'cancelled'), `${from} -> cancelled should be allowed`);
  }
  for (const from of ['preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']) {
    assert.ok(!canTransition(from, 'cancelled'), `${from} -> cancelled must be refused`);
  }
});

test('completed and cancelled are terminal', () => {
  assert.deepEqual(TRANSITIONS.completed, []);
  assert.deepEqual(TRANSITIONS.cancelled, []);
  for (const to of ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']) {
    assert.ok(!canTransition('completed', to), `completed -> ${to} must be refused`);
    assert.ok(!canTransition('cancelled', to), `cancelled -> ${to} must be refused`);
  }
});

test('backward moves are refused', () => {
  // The specific bug this map closes: `ready -> pending` used to return 200.
  const backward = [
    ['confirmed', 'pending'],
    ['preparing', 'confirmed'],
    ['ready', 'preparing'],
    ['out_for_delivery', 'ready'],
    ['completed', 'ready'],
  ];
  for (const [from, to] of backward) {
    assert.ok(!canTransition(from, to), `${from} -> ${to} must be refused`);
  }
});

test('the forward chain is intact', () => {
  const legal = [
    ['pending', 'confirmed'],
    ['confirmed', 'preparing'],
    ['preparing', 'ready'],
    ['ready', 'out_for_delivery'],
    ['out_for_delivery', 'completed'],
    ['ready', 'completed'],
  ];
  for (const [from, to] of legal) {
    assert.ok(canTransition(from, to), `${from} -> ${to} should be allowed`);
  }
});

test('unknown statuses are rejected on both sides', () => {
  assert.equal(isKnownStatus('shipped'), false);
  assert.equal(isKnownStatus(''), false);
  assert.equal(isKnownStatus(undefined), false);
  assert.equal(isKnownStatus(null), false);
  // Prototype keys must not be treated as statuses.
  assert.equal(isKnownStatus('toString'), false);
  assert.equal(isKnownStatus('constructor'), false);
  assert.equal(canTransition('pending', 'toString'), false);
  assert.equal(canTransition('nonsense', 'confirmed'), false);
});

test('re-setting the same status is not a transition', () => {
  // canTransition is false for same -> same on purpose: callers detect that
  // case separately so a retry succeeds without writing a duplicate history
  // row. Asserted here so that separation is not accidentally removed.
  for (const status of ALL_STATUSES) {
    assert.equal(canTransition(status, status), false, `${status} -> ${status}`);
  }
});

// ─── HTTP-level behaviour, against the database ───────────────────────────────

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
 * Deliberately not `server.js`: that binds a port, opens a Socket.io server and
 * installs a startup rate limit, none of which these tests need.
 */
function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  app.use('/api/payments', require('../src/modules/payments/payments.routes'));
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

const setStatus = (id, status) => call('PATCH', `/api/orders/${id}/status`, { body: { status } });
const cancel = (id) => call('POST', `/api/orders/${id}/cancel`);
const pay = (id) => call('POST', '/api/payments', {
  body: { order_id: id, method: 'cash', cash_given: 999999 },
  role: 'cashier',
});
const kitchenSet = (id, status) => call('PATCH', `/api/kitchen/orders/${id}/status`, {
  body: { status }, role: 'kitchen_staff',
});

/**
 * Run `fn` against a throwaway order, then remove it.
 *
 * Wrapping the test in a transaction does NOT work here. The handlers under test
 * call `db.getClient()` themselves, so they check out their own pooled
 * connection and COMMIT outside whatever transaction the test opened. Rolling
 * the test's transaction back afterwards discards nothing — the writes persist.
 * An earlier version of this file did exactly that and silently advanced real
 * seeded orders through their statuses.
 *
 * So instead: create a dedicated order, let the handlers mutate it for real,
 * then delete it. `order_items`, `order_status_history`, `payments` and
 * `kitchen_alerts` all cascade on `orders.id`, and the sequence is advanced by
 * the test, so the table is left exactly as found.
 */
const withTestOrder = async ({ status, payment = 'pending', items = 1, cashierId = null, orderType = 'counter' }, fn) => {
  const created = await db.query(
    `INSERT INTO orders (order_type, status, order_channel, total_amount, cashier_id)
     VALUES ($1, $2, 'web_counter', 100, $3) RETURNING id`,
    [orderType, status, cashierId]);
  const id = created.rows[0].id;

  const menuItem = await db.query(`SELECT id, price FROM menu_items ORDER BY id LIMIT 1`);
  for (let i = 0; i < items; i++) {
    await db.query(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
       VALUES ($1, $2, 1, $3)`,
      [id, menuItem.rows[0].id, menuItem.rows[0].price]);
  }
  // One payment row per order — the unique index from migration 003 enforces it.
  await db.query(
    `INSERT INTO payments (order_id, method, amount, status)
     VALUES ($1, 'cash', 100, $2)`,
    [id, payment]);

  try {
    return await fn(id);
  } finally {
    await db.query('DELETE FROM inventory_transactions WHERE reference_order_id = $1', [id]);
    await db.query(`DELETE FROM orders WHERE id = $1`, [id]);
  }
};

/** The status an order currently holds. */
const statusOf = async (id) =>
  (await db.query(`SELECT status FROM orders WHERE id = $1`, [id])).rows[0].status;

const historyCount = async (id) =>
  (await db.query(
    `SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1`, [id])
  ).rows[0].n;

const paymentStatusOf = async (id) =>
  (await db.query(`SELECT status FROM payments WHERE order_id = $1`, [id])).rows[0].status;

// ─── updateOrderStatus ────────────────────────────────────────────────────────

test('PATCH /status refuses an illegal transition and changes nothing', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending' }, async (id) => {
    const before = await statusOf(id);
    const res = await setStatus(id, 'ready'); // pending -> ready is not a legal jump

    assert.equal(res.status, 409);
    assert.match(res.body.message, /Cannot move to "ready" from "pending"/);
    assert.equal(await statusOf(id), before, 'order status must be untouched');
    assert.equal(await historyCount(id), 0, 'a rejected transition writes no history');
  });
});

test('PATCH /status rejects an unknown status with 400', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending' }, async (id) => {
    const res = await setStatus(id, 'shipped');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /status must be one of/);
    assert.equal(await statusOf(id), 'pending');
  });
});

test('PATCH /status returns 404 for an order that does not exist', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const res = await setStatus(99999999, 'confirmed');
  assert.equal(res.status, 404);
});

test('PATCH /status accepts a legal transition and records history', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending' }, async (id) => {
    const before = await historyCount(id);
    const res = await setStatus(id, 'confirmed');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'confirmed');
    assert.equal(await statusOf(id), 'confirmed');
    assert.equal(await historyCount(id), before + 1, 'exactly one history row added');
  });
});

test('PATCH /status re-setting the same status writes no history row', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'ready' }, async (id) => {
    const before = await historyCount(id);
    const res = await setStatus(id, 'ready'); // same -> same

    // A retry of an already-applied request should succeed, not 409...
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
    // ...but must not pollute the audit trail with a duplicate row.
    assert.equal(await historyCount(id), before, 'no history row for a no-op');
  });
});

test('PATCH /status refuses to move out of a terminal state', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  for (const terminal of ['cancelled', 'completed']) {
    await withTestOrder({ status: terminal }, async (id) => {
      const res = await setStatus(id, 'confirmed');
      assert.equal(res.status, 409, `${terminal} -> confirmed must be refused`);
      assert.equal(await statusOf(id), terminal);
      assert.equal(await historyCount(id), 0);
    });
  }
});

// ─── canTransitionAs (role-aware transitions) ────────────────────────────────

test('canTransitionAs: cashier may only do ready -> completed', () => {
  assert.ok(canTransitionAs('cashier', 'ready', 'completed'));
  assert.equal(canTransitionAs('cashier', 'ready', 'preparing'), false);
  assert.equal(canTransitionAs('cashier', 'confirmed', 'preparing'), false);
  assert.equal(canTransitionAs('cashier', 'pending', 'confirmed'), false);
  assert.equal(canTransitionAs('cashier', 'ready', 'cancelled'), false);
});

test('canTransitionAs: kitchen_staff covers exactly the cooking handoff', () => {
  const allowed = canTransitionAs('kitchen_staff', 'confirmed', 'preparing')
               && canTransitionAs('kitchen_staff', 'preparing', 'ready');
  assert.ok(allowed);
  assert.equal(canTransitionAs('kitchen_staff', 'pending', 'confirmed'), false);
  assert.equal(canTransitionAs('kitchen_staff', 'ready', 'completed'), false);
  assert.equal(canTransitionAs('kitchen_staff', 'ready', 'cancelled'), false);
});

test('canTransitionAs: supervisors may use the whole map except cancelled', () => {
  for (const role of ['staff', 'owner', 'admin', 'manager']) {
    assert.ok(canTransitionAs(role, 'pending', 'confirmed'), `${role} should allow pending -> confirmed`);
    assert.ok(canTransitionAs(role, 'ready', 'completed'), `${role} should allow ready -> completed`);
    assert.equal(canTransitionAs(role, 'pending', 'cancelled'), false, `${role} must not cancel via PATCH`);
  }
});

// ─── HTTP: role gates and the cancelled escape hatch ─────────────────────────

test('PATCH /status never accepts "cancelled", even for supervisors', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending' }, async (id) => {
    const res = await setStatus(id, 'cancelled');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /POST \/api\/orders\/:id\/cancel/);
    assert.equal(await statusOf(id), 'pending', 'status must be untouched');
  });
});

test('PATCH /status: cashier can only complete a ready order (403 otherwise)', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'confirmed' }, async (id) => {
    const denied = await call('PATCH', `/api/orders/${id}/status`, { body: { status: 'preparing' }, role: 'cashier' });
    assert.equal(denied.status, 403, 'cashier must not drive the kitchen chain');
    assert.equal(await statusOf(id), 'confirmed');
  });

  await withTestOrder({ status: 'ready' }, async (id) => {
    const res = await call('PATCH', `/api/orders/${id}/status`, { body: { status: 'completed' }, role: 'cashier' });
    assert.equal(res.status, 200, 'ready -> completed is the cashier handoff closeout');
    assert.equal(await statusOf(id), 'completed');
  });
});

test('POST /:id/cancel is refused for kitchen_staff', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending' }, async (id) => {
    const res = await call('POST', `/api/orders/${id}/cancel`, { role: 'kitchen_staff' });
    assert.equal(res.status, 403);
    assert.equal(await statusOf(id), 'pending');
  });
});

test('kitchen_staff cannot read revenue routes', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const totals = await call('GET', '/api/orders/totals', { role: 'kitchen_staff' });
  assert.equal(totals.status, 403, 'kitchen_staff must not see revenue totals');

  const report = await call('GET', '/api/orders/report', { role: 'kitchen_staff' });
  assert.equal(report.status, 403, 'kitchen_staff must not see the sales report');
});

test('kitchen_staff cannot list or read orders', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending' }, async (id) => {
    const list = await call('GET', '/api/orders', { role: 'kitchen_staff' });
    assert.equal(list.status, 403, 'kitchen reads go through /api/kitchen/orders');

    const detail = await call('GET', `/api/orders/${id}`, { role: 'kitchen_staff' });
    assert.equal(detail.status, 403);
  });
});

// ─── Kitchen regression guard ─────────────────────────────────────────────────
//
// The kitchen refactor replaced two hand-written `if` checks with a map lookup.
// KitchenPage is the only live consumer of status changes and swallows errors
// with console.error, so a transition that started failing here would present
// as a frozen button rather than an error message.

test('kitchen still allows confirmed -> preparing -> ready', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Online orders keep the full chain and stop at 'ready'. Counter orders are
  // the ones that complete in the same step — covered separately below.
  await withTestOrder({ status: 'confirmed', orderType: 'online' }, async (id) => {
    const first = await kitchenSet(id, 'preparing');
    assert.equal(first.status, 200, 'confirmed -> preparing must still work');
    assert.equal(await statusOf(id), 'preparing');

    const second = await kitchenSet(id, 'ready');
    assert.equal(second.status, 200, 'preparing -> ready must still work');
    assert.equal(await statusOf(id), 'ready');

    // Both real transitions should be on the record.
    assert.equal(await historyCount(id), 2);
  });
});

test('marking a counter order ready also completes it', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // A counter ticket has no delivery leg, so the handoff is the whole job:
  // marking it ready must land on 'completed' rather than parking it there
  // for someone to close by hand.
  await withTestOrder({ status: 'confirmed', orderType: 'counter' }, async (id) => {
    const first = await kitchenSet(id, 'preparing');
    assert.equal(first.status, 200);
    assert.equal(await statusOf(id), 'preparing');

    const second = await kitchenSet(id, 'ready');
    assert.equal(second.status, 200, 'preparing -> ready must still work');
    assert.equal(await statusOf(id), 'completed',
      'a counter order finishes the moment the kitchen marks it ready');

    // preparing, then ready, then completed: both writes from the ready step are
    // recorded so the history explains how it closed.
    assert.equal(await historyCount(id), 3);
  });
});

test('kitchen still refuses confirmed -> ready, skipping preparing', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'confirmed' }, async (id) => {
    const res = await kitchenSet(id, 'ready');
    assert.equal(res.status, 409);
    assert.equal(await statusOf(id), 'confirmed');
    assert.equal(await historyCount(id), 0, 'a rejected transition writes no history');
  });
});

test('kitchen still refuses statuses outside its remit', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'confirmed' }, async (id) => {
    // The kitchen is only ever allowed to set preparing or ready. The ALLOWED
    // check runs before the transition check, so this is a 400 not a 409.
    const res = await kitchenSet(id, 'cancelled');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /Kitchen can only set status to: preparing, ready/);
    assert.equal(await statusOf(id), 'confirmed');
  });
});

test('kitchen cannot move a pending order straight to ready', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending' }, async (id) => {
    const res = await kitchenSet(id, 'ready');
    assert.equal(res.status, 409);
    assert.equal(await statusOf(id), 'pending');
  });
});

// ─── Cancel / payment guards ──────────────────────────────────────────────────

test('an order that has been paid cannot be cancelled', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Payment first, then try to void it. The money has been taken, so cancelling
  // would leave a 'paid' payment against a 'cancelled' order — excluded from
  // revenue and with no refund flow to account for it.
  await withTestOrder({ status: 'pending', payment: 'pending' }, async (id) => {
    const paid = await pay(id);
    assert.equal(paid.status, 200, `precondition: payment should succeed, got ${paid.status} ${JSON.stringify(paid.body)}`);
    assert.equal(await paymentStatusOf(id), 'paid');

    const res = await cancel(id);
    assert.equal(res.status, 409, 'cancelling a paid order must be refused');
    assert.match(res.body.message, /already been paid/i);
    assert.equal(await statusOf(id), 'pending', 'the order must not be cancelled');
  });
});

test('an unpaid order can still be cancelled', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending', payment: 'pending' }, async (id) => {
    const res = await cancel(id);
    assert.equal(res.status, 200, `pending -> cancelled should work, got ${JSON.stringify(res.body)}`);
    assert.equal(await statusOf(id), 'cancelled');
  });
});

test('an order past the confirmed stage still cannot be cancelled', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Pre-existing behaviour, asserted so the paid guard is not mistaken for the
  // only thing restricting cancellation.
  for (const status of ['preparing', 'ready', 'out_for_delivery', 'completed']) {
    await withTestOrder({ status, payment: 'pending' }, async (id) => {
      const res = await cancel(id);
      assert.equal(res.status, 409, `${status} must not be cancellable`);
      assert.match(res.body.message, new RegExp(`Cannot cancel an order with status "${status}"`));
      assert.equal(await statusOf(id), status);
    });
  }
});

test('a cancelled order cannot then be paid', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending', payment: 'pending' }, async (id) => {
    const cancelled = await cancel(id);
    assert.equal(cancelled.status, 200, 'precondition: cancel should succeed');
    assert.equal(await statusOf(id), 'cancelled');

    const res = await pay(id);
    assert.equal(res.status, 409, 'paying a cancelled order must be refused');
    assert.match(res.body.message, /cancelled/i);
    assert.equal(await paymentStatusOf(id), 'pending', 'payment must not be marked paid');
  });
});

test('paying an already-paid order is still refused', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withTestOrder({ status: 'pending', payment: 'paid' }, async (id) => {
    const res = await pay(id);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /already been paid/i);
    assert.equal(await paymentStatusOf(id), 'paid', 'must not be re-marked or reset');
  });
});

test('a normal payment on a live order still succeeds', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Guards against the new cancelled-order check accidentally rejecting
  // ordinary cash payments, which are the common case.
  for (const status of ['pending', 'confirmed', 'preparing', 'ready']) {
    await withTestOrder({ status, payment: 'pending' }, async (id) => {
      const res = await pay(id);
      assert.equal(res.status, 200, `${status} should be payable, got ${JSON.stringify(res.body)}`);
      assert.equal(await paymentStatusOf(id), 'paid');
    });
  }
});
