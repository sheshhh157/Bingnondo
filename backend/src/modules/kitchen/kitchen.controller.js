const db = require('../../config/db');
const socketHub = require('../../sockets');

// ─── GET /api/kitchen/orders ──────────────────────────────────────────────────
// Returns all orders with status 'confirmed' or 'preparing'.
// Shape matches the frontend mock: order_items[].menu_item.name
async function getKitchenOrders(req, res, next) {
  try {
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
             'menu_item', json_build_object('name', mi.name)
           ) ORDER BY oi.id
         ) AS order_items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items  mi ON mi.id = oi.menu_item_id
       WHERE o.status IN ('confirmed', 'preparing')
       GROUP BY o.id
       ORDER BY o.created_at ASC`
    );

    res.json({data : rows});
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/kitchen/orders/:id/status ────────────────────────────────────
// Kitchen staff can only move: confirmed → preparing → ready.
// No other transitions allowed from this endpoint.
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

    // Fetch current order
    const { rows: current } = await client.query(
      `SELECT id, status FROM orders WHERE id = $1`,
      [req.params.id]
    );
    if (!current[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    // Enforce valid transitions
    const from = current[0].status;
    if (status === 'preparing' && from !== 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Cannot move to "preparing" from "${from}". Order must be "confirmed".`,
      });
    }
    if (status === 'ready' && from !== 'preparing') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Cannot move to "ready" from "${from}". Order must be "preparing".`,
      });
    }

    // Update order
    const { rows } = await client.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, order_channel,
                 'ORD-' || LPAD(id::text, 4, '0') AS order_number`,
      [status, req.params.id]
    );

    // Log status history
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by)
       VALUES ($1, $2, $3)`,
      [req.params.id, status, req.user.sub]
    );

    await client.query('COMMIT');

    const order = rows[0];

    // Emit to all rooms
    socketHub.emitOrderStatus({
      orderId: order.id,
      orderNumber: order.order_number,
      status,
    });

    // When ready: notify staff for delivery assignment (online orders)
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
// Returns unacknowledged kitchen alerts.
// Shape: { id, order_id, acknowledged_at, order: { order_number }, esp32_device: { location_label } }
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
      await client.query('ROLLBACK');
      // Either already acknowledged or not found — treat both the same way
      return res.status(404).json({
        message: 'Alert not found or already acknowledged.',
      });
    }

    await client.query('COMMIT');

    const { id: alertId, device_id: deviceId } = rows[0];

    // Stop the ESP32 buzzer
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
  updateKitchenOrderStatus,
  getKitchenAlerts,
  acknowledgeAlert,
};