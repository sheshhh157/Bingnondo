/**
 * Tests for rider auto-assignment and the delivery -> order status mirror.
 *
 * Covered:
 *
 *   1. `autoAssignPendingDeliveries` hands a waiting online delivery to a free
 *      rider and marks that rider busy.
 *   2. It does nothing when no rider is free, and ignores Lalamove rows (those
 *      are booked externally and never get one of our riders).
 *   3. The longest-waiting free rider is chosen first.
 *   4. The kitchen's "Mark Ready" auto-assigns an already-waiting delivery.
 *   5. A rider's "Pick Up" moves the linked order to 'out_for_delivery'.
 *   6. A rider's "Delivered" completes the order, frees the rider, and writes
 *      the order_status_history rows (with a null actor — the FK is staff-only).
 *   7. Finishing a delivery auto-assigns the next waiting one to the freed rider.
 *
 * Why this needs asserting: nothing used to create or assign a `deliveries`
 * row — the old delivery module could only UPDATE an existing one. An online
 * order therefore sat at 'ready' forever with no way to reach a rider. The
 * assignment helper is the single place that closes that gap, and the two
 * entry points (kitchen 'ready' and rider 'delivered') both depend on it.
 *
 * The database-backed tests are skipped when no database is reachable.
 *
 * Each test works on its own throwaway orders/riders and deletes them after.
 * It does NOT wrap the test in a transaction: the endpoints under test open
 * their own pooled connection and commit outside it (see orders.status.test.js
 * for the full explanation of why that rules out a rollback).
 *
 * The suite also has to neutralise any pre-existing riders: `pickAvailableRider`
 * would otherwise hand a test delivery to whatever real rider is on duty.
 * `isolateAvailableRiders` sets them all inactive for the duration and restores
 * them afterwards.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const { autoAssignPendingDeliveries } = require('../src/modules/rider/assignment');

// ─── Bootstrap ────────────────────────────────────────────────────────────────

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

/**
 * Bare Express app around the real routers under test.
 *
 * Deliberately not `server.js`: that binds a port, opens a Socket.io server and
 * installs a startup rate limit, none of which these tests need.
 */
function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  app.use('/api/rider', require('../src/modules/rider/rider.routes'));
  return app;
}

async function api(method, path, { body, token } = {}) {
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const init = { method, headers: { Authorization: `Bearer ${token}` } };
    if (body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const jwt = require('jsonwebtoken');
const sign = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });

const staffToken = async (role) => {
  const { rows } = await db.query(
    `SELECT id FROM staff_accounts WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`,
    [role]);
  return rows[0] ? sign({ sub: rows[0].id, type: 'staff', role }) : null;
};

const riderToken = (id) => sign({ sub: id, type: 'rider' });

const kitchenSet = async (orderId, status) =>
  api('PATCH', `/api/kitchen/orders/${orderId}/status`, {
    body: { status },
    token: await staffToken('kitchen_staff'),
  });

const riderSet = (deliveryId, riderId, status) =>
  api('PATCH', `/api/rider/delivery/${deliveryId}/status`, {
    body: { status },
    token: riderToken(riderId),
  });

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let seq = 0;
const uniq = (prefix) => `${prefix}_${Date.now()}_${seq++}`;

const createTestRider = async () => {
  const mobile = `09${String(Date.now()).slice(-6)}${String(seq++).padStart(3, '0')}`;
  const { rows } = await db.query(
    `INSERT INTO riders (full_name, mobile_number, password_hash, status)
     VALUES ($1, $2, 'test', 'available')
     RETURNING id, full_name, mobile_number`,
    [uniq('__rider_test'), mobile]);
  return rows[0];
};

const createOnlineOrderWithDelivery = async ({
  orderStatus = 'ready',
  preference = 'own_delivery',
  deliveryStatus = 'pending_assignment',
} = {}) => {
  const { rows: o } = await db.query(
    `INSERT INTO orders (order_type, status, order_channel, total_amount)
     VALUES ('online', $1, 'mobile_app', 100) RETURNING id`,
    [orderStatus]);
  const orderId = o[0].id;

  const { rows: m } = await db.query(
    `INSERT INTO menu_items (category_id, name, price)
     VALUES ((SELECT id FROM menu_categories ORDER BY id LIMIT 1), $1, 10)
     RETURNING id, price`,
    [uniq('__rider_test_item')]);
  await db.query(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
     VALUES ($1, $2, 1, $3)`,
    [orderId, m[0].id, m[0].price]);

  const { rows: d } = await db.query(
    `INSERT INTO deliveries (order_id, delivery_preference, status)
     VALUES ($1, $2, $3) RETURNING id`,
    [orderId, preference, deliveryStatus]);

  return { orderId, deliveryId: d[0].id, menuItemId: m[0].id };
};

const removeOrder = async ({ orderId, menuItemId }) => {
  await db.query(`DELETE FROM inventory_transactions WHERE reference_order_id = $1`, [orderId]);
  await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
  await db.query(`DELETE FROM menu_items WHERE id = $1`, [menuItemId]);
};

const removeRider = (id) => db.query(`DELETE FROM riders WHERE id = $1`, [id]);

/**
 * Park every currently-available rider as 'inactive' so a test's deliveries can
 * only ever be picked up by the riders it creates itself. Returns a restore fn.
 */
const isolateAvailableRiders = async () => {
  const { rows } = await db.query(`SELECT id, status FROM riders`);
  await db.query(`UPDATE riders SET status = 'inactive' WHERE status = 'available'`);
  return async () => {
    for (const r of rows) {
      if (r.status === 'available') {
        await db.query(`UPDATE riders SET status = 'available' WHERE id = $1`, [r.id]);
      }
    }
  };
};

/** Run `fn` with tracked order/rider fixtures, cleaning both up afterwards. */
const withFixtures = async (fn) => {
  const restore = await isolateAvailableRiders();
  const orders = [];
  const riders = [];
  try {
    await fn({
      order: async (opts) => {
        const o = await createOnlineOrderWithDelivery(opts);
        orders.push(o);
        return o;
      },
      rider: async () => {
        const r = await createTestRider();
        riders.push(r.id);
        return r;
      },
    });
  } finally {
    for (const o of orders) await removeOrder(o);
    for (const id of riders) await removeRider(id);
    await restore();
  }
};

/** Run the helper the way a controller does — inside its own transaction. */
const runAutoAssign = async (opts) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const assigned = await autoAssignPendingDeliveries(client, opts);
    await client.query('COMMIT');
    return assigned;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const deliveryRow = async (id) =>
  (await db.query(`SELECT * FROM deliveries WHERE id = $1`, [id])).rows[0];
const orderStatusOf = async (id) =>
  (await db.query(`SELECT status FROM orders WHERE id = $1`, [id])).rows[0].status;
const riderStatusOf = async (id) =>
  (await db.query(`SELECT status FROM riders WHERE id = $1`, [id])).rows[0].status;
const historyRows = async (orderId) =>
  (await db.query(
    `SELECT status, changed_by FROM order_status_history WHERE order_id = $1 ORDER BY id`,
    [orderId])).rows;

// ─── autoAssignPendingDeliveries ──────────────────────────────────────────────

test('a ready online delivery is assigned to a free rider and the rider goes busy', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withFixtures(async (fx) => {
    const rider = await fx.rider();
    const { deliveryId } = await fx.order();

    const assigned = await runAutoAssign();
    const mine = assigned.find((a) => a.id === deliveryId);
    assert.ok(mine, 'our delivery should have been assigned');
    assert.equal(mine.rider_id, rider.id);

    const row = await deliveryRow(deliveryId);
    assert.equal(row.status, 'assigned');
    assert.equal(row.rider_id, rider.id);
    assert.equal(row.rider_name, rider.full_name);
    assert.equal(row.rider_contact, rider.mobile_number);
    assert.ok(row.assigned_at, 'assigned_at is stamped on assignment');
    assert.equal(await riderStatusOf(rider.id), 'on_delivery');
  });
});

test('a delivery waits when no rider is free', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withFixtures(async (fx) => {
    // No rider created; isolation guarantees the pool is empty.
    const { deliveryId } = await fx.order();

    const assigned = await runAutoAssign();
    assert.equal(assigned.find((a) => a.id === deliveryId), undefined);

    const row = await deliveryRow(deliveryId);
    assert.equal(row.status, 'pending_assignment');
    assert.equal(row.rider_id, null);
  });
});

test('a Lalamove delivery is never given one of our riders', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withFixtures(async (fx) => {
    await fx.rider();
    const { deliveryId } = await fx.order({ preference: 'lalamove' });

    const assigned = await runAutoAssign();
    assert.equal(assigned.find((a) => a.id === deliveryId), undefined);

    const row = await deliveryRow(deliveryId);
    assert.equal(row.status, 'pending_assignment');
    assert.equal(row.rider_id, null);
  });
});

test('the longest-waiting rider is chosen first', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withFixtures(async (fx) => {
    const first = await fx.rider();
    const second = await fx.rider();
    // Make `first` the one who has been available the longest.
    await db.query(
      `UPDATE riders SET updated_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
      [first.id]);

    const d1 = await fx.order();
    const d2 = await fx.order();

    const assigned = await runAutoAssign();
    assert.equal(assigned.length, 2, 'both deliveries should be assigned');

    const a1 = assigned.find((a) => a.id === d1.deliveryId);
    const a2 = assigned.find((a) => a.id === d2.deliveryId);
    assert.equal(a1.rider_id, first.id, 'the waiting-longest rider takes the oldest delivery');
    assert.equal(a2.rider_id, second.id);
  });
});

// ─── Kitchen 'ready' trigger ──────────────────────────────────────────────────

test('the kitchen Mark Ready auto-assigns a waiting online delivery', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withFixtures(async (fx) => {
    const rider = await fx.rider();
    const { orderId, deliveryId } = await fx.order({ orderStatus: 'confirmed' });

    const prep = await kitchenSet(orderId, 'preparing');
    assert.equal(prep.status, 200, `precondition: ${JSON.stringify(prep.body)}`);

    const ready = await kitchenSet(orderId, 'ready');
    assert.equal(ready.status, 200, `Mark Ready should succeed, got ${JSON.stringify(ready.body)}`);

    const row = await deliveryRow(deliveryId);
    assert.equal(row.status, 'assigned', 'the order became dispatchable at ready');
    assert.equal(row.rider_id, rider.id);
    assert.equal(await riderStatusOf(rider.id), 'on_delivery');
  });
});

// ─── Rider status changes mirror onto the order ───────────────────────────────

test('Pick Up moves the linked order to out_for_delivery', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withFixtures(async (fx) => {
    const rider = await fx.rider();
    const { orderId, deliveryId } = await fx.order();
    await runAutoAssign();

    const res = await riderSet(deliveryId, rider.id, 'out_for_delivery');
    assert.equal(res.status, 200, `got ${JSON.stringify(res.body)}`);

    assert.equal((await deliveryRow(deliveryId)).status, 'out_for_delivery');
    assert.equal(await orderStatusOf(orderId), 'out_for_delivery');

    const history = await historyRows(orderId);
    assert.deepEqual(history.map((h) => h.status), ['out_for_delivery']);
    // changed_by is NULL: its FK is staff_accounts, and the rider is not a staff
    // account. The delivery row records the actor instead.
    assert.equal(history[0].changed_by, null);
  });
});

test('Delivered completes the order and frees the rider', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withFixtures(async (fx) => {
    const rider = await fx.rider();
    const { orderId, deliveryId } = await fx.order();
    await runAutoAssign();
    await riderSet(deliveryId, rider.id, 'out_for_delivery');

    const res = await riderSet(deliveryId, rider.id, 'delivered');
    assert.equal(res.status, 200, `got ${JSON.stringify(res.body)}`);
    assert.equal(res.body.delivery, null, 'the rider has no delivery once it is done');

    const row = await deliveryRow(deliveryId);
    assert.equal(row.status, 'delivered');
    assert.ok(row.delivered_at, 'delivered_at is stamped');

    assert.equal(await orderStatusOf(orderId), 'completed');
    assert.equal(await riderStatusOf(rider.id), 'available');

    const history = await historyRows(orderId);
    assert.deepEqual(history.map((h) => h.status), ['out_for_delivery', 'completed']);
    assert.equal(history[1].changed_by, null, 'changed_by is staff-only, so riders leave it null');
  });
});

test('finishing a delivery auto-assigns the next waiting one to the freed rider', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  await withFixtures(async (fx) => {
    const rider = await fx.rider();
    const d1 = await fx.order();
    const d2 = await fx.order();

    // Only one free rider: the first call takes d1 and leaves d2 waiting.
    const first = await runAutoAssign();
    assert.equal(first.find((a) => a.id === d1.deliveryId)?.rider_id, rider.id);
    assert.equal((await deliveryRow(d2.deliveryId)).status, 'pending_assignment');

    await riderSet(d1.deliveryId, rider.id, 'out_for_delivery');
    await riderSet(d1.deliveryId, rider.id, 'delivered');

    // The delivered step freed the rider and immediately picked up d2.
    const row2 = await deliveryRow(d2.deliveryId);
    assert.equal(row2.status, 'assigned');
    assert.equal(row2.rider_id, rider.id);
    assert.equal(await riderStatusOf(rider.id), 'on_delivery', 'busy again with the next delivery');
  });
});
