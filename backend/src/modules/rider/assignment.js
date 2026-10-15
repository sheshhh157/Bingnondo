const socketHub = require('../../sockets');

// ─── Rider auto-assignment ────────────────────────────────────────────────────
//
// There is no "assign a rider" button any more: an online order that needs a
// delivery is given a `deliveries` row (status 'pending_assignment') by the
// customer app, and the backend hands it to a free rider automatically.
//
// Assignment runs at two moments, both because the order and the rider only
// become eligible at those points:
//   1. The kitchen marks an online order 'ready' — the order becomes
//      dispatchable, so any delivery row already waiting gets a rider.
//   2. A rider finishes a delivery (or an admin frees one) — the rider becomes
//      'available' again, so the oldest waiting delivery is picked up.
//
// Every function here is transaction-aware: it takes an open `client` and does
// no COMMIT/ROLLBACK of its own. Socket emits are deliberately kept out of
// these functions — the caller emits AFTER it commits, so a rollback never
// broadcasts a delivery that does not exist.

/**
 * The longest-waiting free rider, locked for this transaction.
 *
 * `SKIP LOCKED` lets two concurrent assignments race without blocking: the
 * second picks the next rider instead of waiting on the first's row lock.
 * Ordered by `updated_at` so whoever became available first is chosen first.
 */
async function pickAvailableRider(client) {
  const { rows } = await client.query(
    `SELECT id, full_name, mobile_number
       FROM riders
      WHERE status = 'available'
      ORDER BY updated_at ASC NULLS FIRST, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`
  );
  return rows[0] || null;
}

/**
 * Point one pending delivery at a rider and mark the rider busy.
 * Returns the updated delivery row, or null if the row was no longer
 * 'pending_assignment' (raced by another assignment).
 */
async function assignDeliveryToRider(client, deliveryId, rider) {
  const { rows } = await client.query(
    `UPDATE deliveries
        SET rider_id      = $1,
            rider_name    = $2,
            rider_contact = $3,
            status        = 'assigned',
            assigned_at   = NOW(),
            assigned_by   = NULL
      WHERE id = $4 AND status = 'pending_assignment'
      RETURNING id, order_id, rider_id, rider_name, rider_contact,
                status, assigned_at`,
    [rider.id, rider.full_name, rider.mobile_number, deliveryId]
  );

  if (!rows[0]) return null;

  await client.query(
    `UPDATE riders SET status = 'on_delivery', updated_at = NOW() WHERE id = $1`,
    [rider.id]
  );

  return rows[0];
}

/**
 * Assign as many waiting deliveries as there are free riders.
 *
 * A candidate is an own-delivery row whose online order is 'ready' — a
 * Lalamove delivery is booked externally and never gets one of our riders.
 *
 * @param {object} client   open pg client (inside a transaction)
 * @param {{ orderId?: number }} [opts]  restrict to a single order when the
 *                                       call comes from the kitchen 'ready' step
 * @returns {Promise<Array>} the deliveries that were assigned, for the caller to broadcast
 */
async function autoAssignPendingDeliveries(client, { orderId = null } = {}) {
  const params = [];
  let where = `d.status = 'pending_assignment'
         AND d.delivery_preference = 'own_delivery'
         AND o.status = 'ready'
         AND o.order_type = 'online'`;

  if (orderId != null) {
    params.push(orderId);
    where += ` AND d.order_id = $1`;
  }

  const { rows: candidates } = await client.query(
    `SELECT d.id
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
      WHERE ${where}
      ORDER BY d.id ASC`,
    params
  );

  const assigned = [];
  for (const candidate of candidates) {
    const rider = await pickAvailableRider(client);
    if (!rider) break; // no free riders left — the rest stay pending for the next retry
    const delivery = await assignDeliveryToRider(client, candidate.id, rider);
    if (delivery) assigned.push(delivery);
  }

  return assigned;
}

/**
 * Broadcast deliveries that were just auto-assigned.
 *
 * The rider room (`rider:<id>`) carries the new assignment to that rider's
 * screen; staff/manager get the update so the cashier console and admin
 * deliveries list refresh. Call this AFTER the transaction commits.
 */
function emitAssignedDeliveries(assigned) {
  for (const delivery of assigned) {
    socketHub.emitDeliveryNew({
      id:               delivery.id,
      delivery_id:      delivery.id,
      order_id:         delivery.order_id,
      rider_id:         delivery.rider_id,
      rider_name:       delivery.rider_name,
      rider_contact:    delivery.rider_contact,
      status:           delivery.status,
      delivery_status:  delivery.status,
      assigned_at:      delivery.assigned_at,
    });

    socketHub.emitDeliveryUpdate({
      id:               delivery.id,
      delivery_id:      delivery.id,
      order_id:         delivery.order_id,
      rider_id:         delivery.rider_id,
      rider_name:       delivery.rider_name,
      rider_contact:    delivery.rider_contact,
      status:           delivery.status,
      delivery_status:  delivery.status,
      order_status:     'ready',
      assigned_at:      delivery.assigned_at,
    });
  }
}

module.exports = {
  pickAvailableRider,
  assignDeliveryToRider,
  autoAssignPendingDeliveries,
  emitAssignedDeliveries,
};
