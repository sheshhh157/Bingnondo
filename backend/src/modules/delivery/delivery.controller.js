const db = require('../../config/db');
const socketHub = require('../../sockets');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function orderNumber(id) {
  return `ORD-${String(id).padStart(4, '0')}`;
}

/**
 * Build a delivery row with its joined order + customer + items.
 * Used by both list and single-row queries so the shape is consistent.
 */
const DELIVERY_SELECT = `
  SELECT
    d.id,
    d.order_id,
    d.rider_id,
    d.rider_name,
    d.rider_contact,
    d.status,
    d.assigned_at,
    d.delivered_at,
    d.assigned_by,
    sa.full_name                                AS assigned_by_name,
    -- Order info
    o.status                                    AS order_status,
    'ORD-' || LPAD(o.id::text, 4, '0')         AS order_number,
    o.total_amount::float,
    o.created_at,
    o.special_request,
    -- Customer info (snapshotted at query time — not stored)
    c.first_name || ' ' || c.last_name         AS customer_name,
    c.mobile_number                             AS customer_contact,
    c.address                                   AS customer_address,
    -- Registered rider info (if assigned via rider_id)
    r.full_name                                 AS registered_rider_name,
    r.mobile_number                             AS registered_rider_contact,
    -- Items as JSON array
    json_agg(
      json_build_object(
        'id',           oi.id,
        'menu_item_id', oi.menu_item_id,
        'quantity',     oi.quantity,
        'unit_price',   oi.unit_price::float,
        'notes',        oi.notes,
        'menu_item',    json_build_object('name', mi.name)
      ) ORDER BY oi.id
    ) AS order_items
  FROM deliveries d
  JOIN orders o          ON o.id = d.order_id
  JOIN customers c       ON c.id = o.customer_id
  JOIN order_items oi    ON oi.order_id = o.id
  JOIN menu_items mi     ON mi.id = oi.menu_item_id
  LEFT JOIN staff_accounts sa ON sa.id = d.assigned_by
  LEFT JOIN riders r     ON r.id = d.rider_id
`;

// ─── GET /api/deliveries ──────────────────────────────────────────────────────
// Staff view — all deliveries, filterable by status.
// Query params: status (single value, e.g. 'pending_assignment')
async function getDeliveries(req, res, next) {
  try {
    const { status } = req.query;

    const conditions = ['1=1'];
    const params = [];
    let p = 1;

    if (status && status !== 'all') {
      conditions.push(`d.status = $${p++}`);
      params.push(status);
    }

    const { rows } = await db.query(
      `${DELIVERY_SELECT}
       WHERE ${conditions.join(' AND ')}
       GROUP BY d.id, o.id, o.status, o.total_amount, o.created_at,
                o.special_request, c.first_name, c.last_name,
                c.mobile_number, c.address,
                sa.full_name, r.full_name, r.mobile_number
       ORDER BY
         CASE d.status
           WHEN 'pending_assignment' THEN 1
           WHEN 'assigned'           THEN 2
           WHEN 'out_for_delivery'   THEN 3
           WHEN 'delivered'          THEN 4
           WHEN 'cancelled'          THEN 5
           ELSE 6
         END,
         d.id DESC`,
      params
    );

    res.json({ deliveries: rows });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/riders?status=available ────────────────────────────────────────
// Staff read — rider dropdown during assignment. Returns only active + available.
async function getAvailableRiders(req, res, next) {
  try {
    const { status } = req.query;
    // Default to 'available'; allow caller to request 'all' for admin views
    const allowedStatuses = ['available', 'on_delivery', 'inactive', 'all'];
    const filter = allowedStatuses.includes(status) ? status : 'available';

    let whereClause = filter === 'all' ? '1=1' : `r.status = $1`;
    const params = filter === 'all' ? [] : [filter];

    const { rows } = await db.query(
      `SELECT id, full_name, mobile_number, plate_number, vehicle_type, status
       FROM riders r
       WHERE ${whereClause}
         AND r.status <> 'inactive'
       ORDER BY full_name ASC`,
      params
    );

    res.json({ riders: rows });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/deliveries/:id/assign ─────────────────────────────────────────
// Staff assigns a registered rider or enters ad-hoc name + contact.
// Body:
//   { rider_id?: number, rider_name?: string, rider_contact?: string }
//   Either rider_id (registered) OR rider_name + rider_contact (ad-hoc).
async function assignDelivery(req, res, next) {
  const client = await db.getClient();
  try {
    const deliveryId = parseInt(req.params.id, 10);
    const { rider_id, rider_name, rider_contact } = req.body;

    // Must supply either a registered rider OR manual name+contact, not neither
    if (!rider_id && (!rider_name?.trim() || !rider_contact?.trim())) {
      return res.status(400).json({
        message: 'Provide a registered rider_id OR both rider_name and rider_contact.',
      });
    }

    await client.query('BEGIN');

    // 1. Lock and validate the delivery row
    const { rows: dRows } = await client.query(
      `SELECT d.id, d.status, d.order_id, o.customer_id
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE d.id = $1
       FOR UPDATE`,
      [deliveryId]
    );

    if (!dRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Delivery not found.' });
    }

    if (dRows[0].status !== 'pending_assignment') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Delivery is already "${dRows[0].status}" — cannot re-assign.`,
      });
    }

    let resolvedName = rider_name?.trim() || null;
    let resolvedContact = rider_contact?.trim() || null;
    let resolvedRiderId = null;

    // 2. If rider_id supplied, validate rider exists, is available, and snapshot their info
    if (rider_id) {
      const { rows: rRows } = await client.query(
        `SELECT id, full_name, mobile_number, status FROM riders WHERE id = $1 FOR UPDATE`,
        [rider_id]
      );

      if (!rRows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Rider not found.' });
      }
      if (rRows[0].status === 'inactive') {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Rider is inactive and cannot be assigned.' });
      }
      if (rRows[0].status === 'on_delivery') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'Rider is already on a delivery. Wait until they complete it.',
        });
      }

      resolvedRiderId = rRows[0].id;
      resolvedName = rRows[0].full_name;           // snapshot at assignment time
      resolvedContact = rRows[0].mobile_number;    // snapshot at assignment time

      // Set rider status to on_delivery
      await client.query(
        `UPDATE riders SET status = 'on_delivery', updated_at = NOW() WHERE id = $1`,
        [resolvedRiderId]
      );
    }

    // 3. Update delivery row
    const { rows: updated } = await client.query(
      `UPDATE deliveries
       SET rider_id     = $1,
           rider_name   = $2,
           rider_contact = $3,
           status       = 'assigned',
           assigned_by  = $4,
           assigned_at  = NOW()
       WHERE id = $5
       RETURNING *`,
      [resolvedRiderId, resolvedName, resolvedContact, req.user.sub, deliveryId]
    );

    // 4. Update order status to out_for_delivery? No — per flow: assigned → (rider picks up) → out_for_delivery
    //    But we DO update the order status to reflect assignment (stays 'ready' until rider marks OFD)
    //    Emit delivery update for real-time
    await client.query('COMMIT');

    const delivery = updated[0];

    // Emit real-time update to staff/manager rooms
    socketHub.emitDeliveryUpdate({
      id: delivery.id,
      order_id: delivery.order_id,
      status: delivery.status,
      rider_id: delivery.rider_id,
      rider_name: delivery.rider_name,
      rider_contact: delivery.rider_contact,
      assigned_at: delivery.assigned_at,
    });

    res.json(delivery);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── PATCH /api/deliveries/:id/status ────────────────────────────────────────
// Update delivery status: assigned → out_for_delivery → delivered | cancelled
// Also callable by rider via /api/rider/delivery/:id/status (separate route, same logic)
async function updateDeliveryStatus(req, res, next) {
  const client = await db.getClient();
  try {
    const deliveryId = parseInt(req.params.id, 10);
    const { status: newStatus } = req.body;

    const VALID_TRANSITIONS = {
      assigned:         ['out_for_delivery', 'cancelled'],
      out_for_delivery: ['delivered'],
    };

    if (!newStatus) {
      return res.status(400).json({ message: 'status is required.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT d.id, d.status, d.order_id, d.rider_id, o.customer_id
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE d.id = $1
       FOR UPDATE`,
      [deliveryId]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Delivery not found.' });
    }

    const current = rows[0];
    const allowed = VALID_TRANSITIONS[current.status] || [];

    if (!allowed.includes(newStatus)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Cannot move delivery from "${current.status}" to "${newStatus}".`,
      });
    }

    // Build update payload
    const updateFields = [`status = $1`];
    const updateParams = [newStatus];
    let pIdx = 2;

    if (newStatus === 'delivered') {
      updateFields.push(`delivered_at = $${pIdx++}`);
      updateParams.push(new Date());
    }

    updateParams.push(deliveryId);

    const { rows: updated } = await client.query(
      `UPDATE deliveries SET ${updateFields.join(', ')} WHERE id = $${pIdx} RETURNING *`,
      updateParams
    );

    // When delivered: mark order completed + free up rider
    if (newStatus === 'delivered') {
      await client.query(
        `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [current.order_id]
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'completed', $2)`,
        [current.order_id, req.user.sub]
      );

      if (current.rider_id) {
        await client.query(
          `UPDATE riders SET status = 'available', updated_at = NOW() WHERE id = $1`,
          [current.rider_id]
        );
      }

      // Notify customer via socket
      if (current.customer_id) {
        socketHub.emitOrderStatus({
          orderId: current.order_id,
          orderNumber: orderNumber(current.order_id),
          status: 'completed',
        });
      }
    }

    // When cancelled: free up rider if one was assigned
    if (newStatus === 'cancelled' && current.rider_id) {
      await client.query(
        `UPDATE riders SET status = 'available', updated_at = NOW() WHERE id = $1`,
        [current.rider_id]
      );
    }

    await client.query('COMMIT');

    const delivery = updated[0];

    socketHub.emitDeliveryUpdate({
      id: delivery.id,
      order_id: delivery.order_id,
      status: delivery.status,
      rider_id: delivery.rider_id,
      rider_name: delivery.rider_name,
      rider_contact: delivery.rider_contact,
      delivered_at: delivery.delivered_at,
    });

    // Notify customer of out_for_delivery too
    if (newStatus === 'out_for_delivery') {
      socketHub.emitOrderStatus({
        orderId: current.order_id,
        orderNumber: orderNumber(current.order_id),
        status: 'out_for_delivery',
      });
    }

    res.json(delivery);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/rider/delivery/current ─────────────────────────────────────────
// Rider-scoped: get their current assigned delivery (on_delivery status)
async function getRiderCurrentDelivery(req, res, next) {
  try {
    const riderId = req.user.sub; // rider JWT sub = riders.id

    const { rows } = await db.query(
      `${DELIVERY_SELECT}
       WHERE d.rider_id = $1
         AND d.status IN ('assigned', 'out_for_delivery')
       GROUP BY d.id, o.id, o.status, o.total_amount, o.created_at,
                o.special_request, c.first_name, c.last_name,
                c.mobile_number, c.address,
                sa.full_name, r.full_name, r.mobile_number
       ORDER BY d.assigned_at DESC
       LIMIT 1`,
      [riderId]
    );

    if (!rows[0]) {
      return res.json({ delivery: null });
    }

    res.json({ delivery: rows[0] });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/rider/deliveries ────────────────────────────────────────────────
// Rider-scoped: delivery history (delivered ones)
async function getRiderDeliveries(req, res, next) {
  try {
    const riderId = req.user.sub;

    const { rows } = await db.query(
      `${DELIVERY_SELECT}
       WHERE d.rider_id = $1
         AND d.status = 'delivered'
       GROUP BY d.id, o.id, o.status, o.total_amount, o.created_at,
                o.special_request, c.first_name, c.last_name,
                c.mobile_number, c.address,
                sa.full_name, r.full_name, r.mobile_number
       ORDER BY d.delivered_at DESC
       LIMIT 50`,
      [riderId]
    );

    res.json({ deliveries: rows });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/rider/delivery/:id/status ────────────────────────────────────
// Rider marks their own delivery as out_for_delivery or delivered.
// Enforces that the rider can only update their OWN deliveries.
async function updateRiderDeliveryStatus(req, res, next) {
  try {
    const deliveryId = parseInt(req.params.id, 10);
    const riderId = req.user.sub;

    // Quick ownership check before delegating to shared update
    const { rows: check } = await db.query(
      `SELECT id, rider_id FROM deliveries WHERE id = $1`,
      [deliveryId]
    );

    if (!check[0]) {
      return res.status(404).json({ message: 'Delivery not found.' });
    }
    if (Number(check[0].rider_id) !== Number(riderId)) {
      return res.status(403).json({ message: 'You can only update your own deliveries.' });
    }

    // Delegate to the shared status update logic (uses its own db client)
    return updateDeliveryStatus(req, res, next);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDeliveries,
  getAvailableRiders,
  assignDelivery,
  updateDeliveryStatus,
  getRiderCurrentDelivery,
  getRiderDeliveries,
  updateRiderDeliveryStatus,
};