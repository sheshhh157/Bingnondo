const db = require('../../config/db');
const socketHub = require('../../sockets');
// Shared transition rules. The kitchen used to hand-enforce its own
// `confirmed -> preparing -> ready` chain here, which could drift from the
// rules in the orders module. See orders/status-transitions.js.
const { canTransition } = require('../orders/status-transitions');

// The kitchen's own live prep queue. 'ready' is deliberately excluded: the
// kitchen marks an order ready and is then done with it, so a ready ticket
// sitting in its queue is stale work competing with orders still being made.
const PREP_STATUSES = ['pending', 'confirmed', 'preparing'];

// Manager-only opt-in. The manager watches for orders to be handed over once
// they leave the kitchen, which is a status the prep queue drops on purpose.
// Off by default so the kitchen display and its socket flow are untouched;
// no other caller sends it.
const PREP_PLUS_HANDOFF_STATUSES = [...PREP_STATUSES, 'ready'];

// ─── GET /api/kitchen/orders ──────────────────────────────────────────────────
// Returns all orders with status 'pending', 'confirmed', or 'preparing'.
// `?include_ready=1` additionally returns 'ready' (see above).
async function getKitchenOrders(req, res, next) {
  try {
    const statuses =
      req.query.include_ready === '1' ? PREP_PLUS_HANDOFF_STATUSES : PREP_STATUSES;
    // Both lists are module constants, never caller input. Build the IN clause
    // from a quoted literal list rather than binding placeholders so the shape
    // of the prepared statement does not change with the flag.
    const inClause = statuses.map((s) => `'${s}'`).join(', ');

    const { rows } = await db.query(
      `SELECT
         o.id,
         'ORD-' || LPAD(o.id::text, 4, '0') AS order_number,
         o.order_type,
         o.order_channel,
         o.status,
         o.special_request,
         o.created_at,
json_agg(
            json_build_object(
              'id',        oi.id,
              'quantity',  oi.quantity,
              'notes',     oi.notes,
              'menu_item', json_build_object('name', mi.name),
              -- Variant the cashier sold ("Hot" / "Iced"). Without this the
              -- ticket just said "Cappuccino" and the kitchen had to guess.
              -- LEFT JOIN: items with no options must still produce a line.
              'option',    CASE WHEN mio.id IS NULL THEN NULL
                                ELSE json_build_object('name', mio.name) END,
              -- Flavor add-on picked on top of the variant, if any.
              'flavor',    CASE WHEN mfio.id IS NULL THEN NULL
                                ELSE json_build_object('name', mfio.name) END
            ) ORDER BY oi.id
          ) AS order_items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items  mi ON mi.id = oi.menu_item_id
        LEFT JOIN menu_item_options mio ON mio.id = oi.menu_item_option_id
        LEFT JOIN menu_item_options mfio ON mfio.id = oi.menu_item_flavor_id
         WHERE o.status IN (${inClause})
       GROUP BY o.id
       ORDER BY o.created_at ASC`
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/kitchen/orders/:id/acknowledge ───────────────────────────────
// Kitchen acknowledges a pending order → moves it to 'confirmed'.
// This is the step that validates the ESP32 buzzer alert had an effect.
async function acknowledgeOrder(req, res, next) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows: current } = await client.query(
      `SELECT id, status, order_channel,
              'ORD-' || LPAD(id::text, 4, '0') AS order_number
         FROM orders WHERE id = $1`,
      [req.params.id]
    );
    if (!current[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    // Silencing the buzzer is the point of this endpoint, so the alert is
    // cleared whatever the order status happens to be. A retried click, or a
    // second tab that already acknowledged, must never leave the ESP32 stuck
    // buzzing just because the status moved on.
    const { rows: acked } = await client.query(
      `UPDATE kitchen_alerts
          SET acknowledged_at = NOW(), acknowledged_by = $1
        WHERE order_id = $2 AND acknowledged_at IS NULL
        RETURNING id, device_id`,
      [req.user.sub, req.params.id]
    );

    // Only advance the status machine when it is actually still on 'pending'.
    // Already-acknowledged orders are a no-op here, not an error.
    const wasPending = current[0].status === 'pending';
    let order = current[0];

    if (wasPending) {
      const { rows } = await client.query(
        `UPDATE orders SET status = 'confirmed', updated_at = NOW()
         WHERE id = $1
         RETURNING id, status, order_channel,
                   'ORD-' || LPAD(id::text, 4, '0') AS order_number`,
        [req.params.id]
      );
      order = rows[0];

      await client.query(
        `INSERT INTO order_status_history (order_id, status, changed_by)
         VALUES ($1, 'confirmed', $2)`,
        [req.params.id, req.user.sub]
      );
    }

    await client.query('COMMIT');

    if (wasPending) {
      socketHub.emitOrderStatus({
        orderId: order.id,
        orderNumber: order.order_number,
        status: 'confirmed',
      });
    }

    // Tell the ESP32 to stop buzzing for every alert closed by this request
    for (const { id: alertId, deviceId } of acked) {
      socketHub.emitKitchenAlertAck({ alertId, deviceId });
    }

    res.json({ ...order, statusChanged: wasPending, alertsAcknowledged: acked.length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── PATCH /api/kitchen/orders/:id/status ────────────────────────────────────
// Kitchen staff can only move: confirmed → preparing → ready.
async function updateKitchenOrderStatus(req, res, next) {
  const client = await db.getClient();
  try {
    const { status } = req.body;
    const ALLOWED = ['preparing', 'ready'];

    if (!ALLOWED.includes(status)) {
      return res.status(400).json({
        message: `Kitchen can only set status to: ${ALLOWED.join(', ')}.`,
      });
    }

    await client.query('BEGIN');

    const { rows: current } = await client.query(
      `SELECT id, status FROM orders WHERE id = $1`,
      [req.params.id]
    );
    if (!current[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    const from = current[0].status;
    if (!canTransition(from, status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Cannot move to "${status}" from "${from}". Kitchen can only set status to: ${ALLOWED.join(', ')}.`,
      });
    }

    const { rows } = await client.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, order_channel,
                 'ORD-' || LPAD(id::text, 4, '0') AS order_number`,
      [status, req.params.id]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by)
       VALUES ($1, $2, $3)`,
      [req.params.id, status, req.user.sub]
    );

    await client.query('COMMIT');

    const order = rows[0];

    socketHub.emitOrderStatus({
      orderId: order.id,
      orderNumber: order.order_number,
      status,
    });

    if (status === 'ready') {
      socketHub.emitOrderReady({
        orderId: order.id,
        orderNumber: order.order_number,
      });
    }

    res.json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/kitchen/alerts ─────────────────────────────────────────────────
async function getKitchenAlerts(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT
         ka.id,
         ka.order_id,
         ka.device_id,
         ka.triggered_at,
         ka.acknowledged_at,
         ka.acknowledged_by,
         json_build_object(
           'order_number',
           'ORD-' || LPAD(o.id::text, 4, '0')
         ) AS "order",
         CASE
           WHEN ed.id IS NOT NULL
           THEN json_build_object(
             'id',             ed.id,
             'location_label', ed.location_label
           )
           ELSE NULL
         END AS esp32_device
       FROM kitchen_alerts ka
       JOIN orders       o  ON o.id  = ka.order_id
       LEFT JOIN esp32_devices ed ON ed.id = ka.device_id
       WHERE ka.acknowledged_at IS NULL
       ORDER BY ka.triggered_at ASC`
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/kitchen/alerts/:id/acknowledge ────────────────────────────────
// Kitchen staff acknowledges an alert → stops the ESP32 buzzer.
async function acknowledgeAlert(req, res, next) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE kitchen_alerts
       SET acknowledged_at = NOW(), acknowledged_by = $1
       WHERE id = $2 AND acknowledged_at IS NULL
       RETURNING id, device_id`,
      [req.user.sub, req.params.id]
    );

    if (!rows[0]) {
      // Nothing was updated. Either the id is bogus, or the alert was already
      // acknowledged — most likely by PATCH /orders/:id/acknowledge, which
      // clears this order's alerts so the kitchen's primary button also stops
      // the buzzer. That is the desired end state, not a failure, so report
      // success and let the caller settle instead of raising a 404.
      const { rows: existing } = await client.query(
        `SELECT id, device_id, acknowledged_at FROM kitchen_alerts WHERE id = $1`,
        [req.params.id]
      );

      if (!existing[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Alert not found.' });
      }

      await client.query('COMMIT');
      socketHub.emitKitchenAlertAck({
        alertId: existing[0].id,
        deviceId: existing[0].device_id,
      });
      return res.json({
        message: 'Alert already acknowledged.',
        alertId: existing[0].id,
        alreadyAcknowledged: true,
      });
    }

    await client.query('COMMIT');

    const { id: alertId, device_id: deviceId } = rows[0];

    if (deviceId) {
      socketHub.emitKitchenAlertAck({ alertId, deviceId });
    }

    res.json({ message: 'Alert acknowledged.', alertId });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  getKitchenOrders,
  acknowledgeOrder,
  updateKitchenOrderStatus,
  getKitchenAlerts,
  acknowledgeAlert,
};