const db = require('../../config/db');
const { emitOrderStatus, emitDeliveryUpdate } = require('../../sockets');

// ─── Helper ───────────────────────────────────────────────────────────────────
function orderNumber(id) {
  return `ORD-${String(id).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7.2 — GET /api/rider/delivery/current
//
// Frontend (ActiveDelivery.jsx) expects a flat delivery object:
// {
//   delivery: {
//     id, order_id, order_number, status, assigned_at,
//     customer_name, customer_contact, delivery_address,
//     items: [{ name, quantity, unit_price }],
//     total_amount, special_request,
//   } | null
// }
// ─────────────────────────────────────────────────────────────────────────────
exports.getCurrentDelivery = async (req, res) => {
  try {
    const riderId = req.user.sub;

    const { rows } = await db.query(
      `SELECT
          d.id                AS id,
          d.status,
          d.assigned_at,
          d.rider_contact,        -- fallback contact (snapshot at assignment time)
          o.id                AS order_id,
          o.total_amount,
          o.special_request,
          o.created_at        AS order_placed_at,
          c.first_name,
          c.last_name,
          c.mobile_number     AS customer_mobile,
          c.address           AS delivery_address
       FROM deliveries d
       JOIN orders     o ON o.id = d.order_id
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE d.rider_id = $1
         AND d.status NOT IN ('delivered', 'cancelled')
       ORDER BY d.assigned_at DESC
       LIMIT 1`,
      [riderId]
    );

    if (rows.length === 0) {
      return res.status(200).json({ delivery: null });
    }

    const row = rows[0];

    // Fetch line items
    const itemsRes = await db.query(
      `SELECT oi.quantity, oi.unit_price, oi.notes, mi.name
         FROM order_items oi
         JOIN menu_items  mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = $1`,
      [row.order_id]
    );

    // Flatten to the shape ActiveDelivery.jsx reads
    return res.status(200).json({
      delivery: {
        id:               row.id,
        order_id:         row.order_id,
        order_number:     orderNumber(row.order_id),
        status:           row.status,
        assigned_at:      row.assigned_at,
        customer_name:    `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'N/A',
        customer_contact: row.customer_mobile ?? row.rider_contact ?? null,
        delivery_address: row.delivery_address ?? '—',
        total_amount:     parseFloat(row.total_amount),
        special_request:  row.special_request ?? null,
        items: itemsRes.rows.map((i) => ({
          name:       i.name,
          quantity:   i.quantity,
          unit_price: parseFloat(i.unit_price),
          notes:      i.notes ?? null,
        })),
      },
    });
  } catch (err) {
    console.error('[rider.getCurrentDelivery]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7.2 — PATCH /api/rider/delivery/:id/status
//
// payload: { status: 'out_for_delivery' | 'delivered' }
//
// Allowed transitions:
//   assigned         → out_for_delivery
//   out_for_delivery → delivered
//
// Side effects on 'delivered':
//   orders.status      → 'completed'
//   order_status_history row inserted
//   riders.status      → 'available'
//   Socket.io events emitted
//
// Response (used by ActiveDelivery.jsx):
// {
//   message, delivery_id, delivery_status,
//   delivery: { ...same flat shape as getCurrentDelivery } | null
// }
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
  assigned:         ['out_for_delivery'],
  out_for_delivery: ['delivered'],
};

exports.updateDeliveryStatus = async (req, res) => {
  const client = await db.getClient();
  try {
    const riderId    = req.user.sub;
    const deliveryId = parseInt(req.params.id, 10);
    const { status: newStatus } = req.body;

    if (!newStatus) {
      return res.status(400).json({ message: 'status is required.' });
    }

    // 1. Load delivery — verify it belongs to this rider
    const { rows } = await client.query(
      `SELECT d.id, d.status, d.order_id, d.rider_id
         FROM deliveries d
        WHERE d.id = $1`,
      [deliveryId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Delivery not found.' });
    }
    const delivery = rows[0];

    if (delivery.rider_id !== riderId) {
      return res.status(403).json({ message: "You don't have permission to update this delivery." });
    }

    // 2. Validate status transition
    const allowed = ALLOWED_TRANSITIONS[delivery.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        message: `Cannot transition from '${delivery.status}' to '${newStatus}'.`,
      });
    }

    await client.query('BEGIN');

    // 3. Update delivery row
    await client.query(
      `UPDATE deliveries
          SET status = $1${newStatus === 'delivered' ? ', delivered_at = NOW()' : ''}
        WHERE id = $2`,
      [newStatus, deliveryId]
    );

    // 4. Side effects when delivered
    if (newStatus === 'delivered') {
      // a. Complete the linked order
      await client.query(
        `UPDATE orders
            SET status = 'completed', updated_at = NOW()
          WHERE id = $1`,
        [delivery.order_id]
      );

      // b. Audit trail
      await client.query(
        `INSERT INTO order_status_history (order_id, status, changed_by)
         VALUES ($1, 'completed', NULL)`,
        [delivery.order_id]
      );

      // c. Free the rider
      await client.query(
        `UPDATE riders
            SET status = 'available', updated_at = NOW()
          WHERE id = $1`,
        [riderId]
      );
    }

    await client.query('COMMIT');

    // 5. Real-time events
    const orderStatus = newStatus === 'delivered' ? 'completed' : 'out_for_delivery';
    emitOrderStatus({
      orderId:     delivery.order_id,
      orderNumber: orderNumber(delivery.order_id),
      status:      orderStatus,
    });
    emitDeliveryUpdate({
      delivery_id:     deliveryId,
      order_id:        delivery.order_id,
      delivery_status: newStatus,
      order_status:    orderStatus,
    });

    // 6. Build the full delivery response the frontend needs.
    //    Frontend does: setDelivery(res.delivery || { ...delivery, status })
    //    So res.delivery must be the complete flat object — never a partial stub —
    //    or the card shows ₱NaN and blank customer fields.
    //    For 'delivered' we return null so the card clears itself.
    let updatedDelivery = null;
    if (newStatus !== 'delivered') {
      const { rows: dRows } = await db.query(
        `SELECT
            d.id,
            d.status,
            d.assigned_at,
            d.rider_contact,
            o.id            AS order_id,
            o.total_amount,
            o.special_request,
            o.created_at    AS order_placed_at,
            c.first_name,
            c.last_name,
            c.mobile_number AS customer_mobile,
            c.address       AS delivery_address
           FROM deliveries d
           JOIN orders     o ON o.id = d.order_id
           LEFT JOIN customers c ON c.id = o.customer_id
          WHERE d.id = $1`,
        [deliveryId]
      );

      if (dRows.length > 0) {
        const r = dRows[0];
        const itemsRes = await db.query(
          `SELECT oi.quantity, oi.unit_price, oi.notes, mi.name
             FROM order_items oi
             JOIN menu_items  mi ON mi.id = oi.menu_item_id
            WHERE oi.order_id = $1`,
          [r.order_id]
        );
        updatedDelivery = {
          id:               r.id,
          order_id:         r.order_id,
          order_number:     orderNumber(r.order_id),
          status:           r.status,
          assigned_at:      r.assigned_at,
          customer_name:    `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'N/A',
          customer_contact: r.customer_mobile ?? r.rider_contact ?? null,
          delivery_address: r.delivery_address ?? '—',
          total_amount:     parseFloat(r.total_amount),
          special_request:  r.special_request ?? null,
          items: itemsRes.rows.map((i) => ({
            name:       i.name,
            quantity:   i.quantity,
            unit_price: parseFloat(i.unit_price),
            notes:      i.notes ?? null,
          })),
        };
      }
    }

    return res.status(200).json({
      message:         `Delivery marked as '${newStatus}'.`,
      delivery_id:     deliveryId,
      delivery_status: newStatus,
      delivery:        updatedDelivery,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[rider.updateDeliveryStatus]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7.3 — GET /api/rider/deliveries
//
// Query params: ?page=1&limit=15
//
// Frontend (DeliveryHistory.jsx) expects:
// {
//   deliveries: [{
//     id, order_id, order_number, status,
//     customer_name, delivery_address,
//     total_amount, assigned_at, delivered_at,
//     items: [{ name, quantity }]
//   }],
//   pagination: { page, limit, total, total_pages }
// }
// ─────────────────────────────────────────────────────────────────────────────
exports.getDeliveryHistory = async (req, res) => {
  try {
    const riderId = req.user.sub;

    const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '20', 10)));
    const offset = (page - 1) * limit;

    // Total count for pagination
    const countRes = await db.query(
      `SELECT COUNT(*) FROM deliveries
        WHERE rider_id = $1 AND status = 'delivered'`,
      [riderId]
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const { rows } = await db.query(
      `SELECT
          d.id,
          d.status,
          d.assigned_at,
          d.delivered_at,
          o.id            AS order_id,
          o.total_amount,
          c.first_name,
          c.last_name,
          c.address       AS delivery_address
         FROM deliveries d
         JOIN orders     o ON o.id = d.order_id
         LEFT JOIN customers c ON c.id = o.customer_id
        WHERE d.rider_id = $1
          AND d.status = 'delivered'
        ORDER BY d.delivered_at DESC
        LIMIT $2 OFFSET $3`,
      [riderId, limit, offset]
    );

    // Fetch items for all returned deliveries in one query
    const orderIds = rows.map((r) => r.order_id);
    let itemsByOrder = {};
    if (orderIds.length > 0) {
      const itemsRes = await db.query(
        `SELECT oi.order_id, oi.quantity, mi.name
           FROM order_items oi
           JOIN menu_items  mi ON mi.id = oi.menu_item_id
          WHERE oi.order_id = ANY($1)`,
        [orderIds]
      );
      for (const item of itemsRes.rows) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push({ name: item.name, quantity: item.quantity });
      }
    }

    return res.status(200).json({
      deliveries: rows.map((r) => ({
        id:               r.id,
        order_id:         r.order_id,
        order_number:     orderNumber(r.order_id),
        status:           r.status,
        customer_name:    `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'N/A',
        delivery_address: r.delivery_address ?? '—',
        total_amount:     parseFloat(r.total_amount),
        assigned_at:      r.assigned_at,
        delivered_at:     r.delivered_at,
        items:            itemsByOrder[r.order_id] ?? [],
      })),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[rider.getDeliveryHistory]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BONUS — GET /api/rider/profile  (used by RiderProfile.jsx)
//
// Response: { rider: { id, full_name, email, mobile_number,
//                      plate_number, vehicle_type, status, last_login } }
// ─────────────────────────────────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const riderId = req.user.sub;

    const { rows } = await db.query(
      `SELECT id, full_name, email, mobile_number,
              plate_number, vehicle_type, status, last_login
         FROM riders WHERE id = $1`,
      [riderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Rider not found.' });
    }

    return res.status(200).json({ rider: rows[0] });
  } catch (err) {
    console.error('[rider.getProfile]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BONUS — PATCH /api/rider/profile  (used by RiderProfile.jsx)
//
// Editable fields: plate_number, vehicle_type, mobile_number
// ─────────────────────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const riderId = req.user.sub;
    const { plate_number, vehicle_type, mobile_number } = req.body;

    // Build dynamic SET clause — only update fields that were sent
    const fields = [];
    const values = [];
    let idx = 1;

    if (plate_number !== undefined) {
      fields.push(`plate_number = $${idx++}`);
      values.push(plate_number);
    }
    if (vehicle_type !== undefined) {
      fields.push(`vehicle_type = $${idx++}`);
      values.push(vehicle_type);
    }
    if (mobile_number !== undefined) {
      if (!/^09\d{9}$/.test(mobile_number)) {
        return res.status(400).json({ message: 'Invalid mobile number format. Use 09XXXXXXXXX.' });
      }
      fields.push(`mobile_number = $${idx++}`);
      values.push(mobile_number);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(riderId);

    const { rows } = await db.query(
      `UPDATE riders
          SET ${fields.join(', ')}
        WHERE id = $${idx}
       RETURNING id, full_name, email, mobile_number,
                 plate_number, vehicle_type, status, last_login`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Rider not found.' });
    }

    return res.status(200).json({
      message: 'Profile updated.',
      rider: rows[0],
    });
  } catch (err) {
    // Unique constraint on mobile_number
    if (err.code === '23505' && err.constraint?.includes('mobile')) {
      return res.status(409).json({ message: 'That mobile number is already in use.' });
    }
    console.error('[rider.updateProfile]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};