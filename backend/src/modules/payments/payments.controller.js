const db         = require('../../config/db');
const socketHub  = require('../../sockets');

// ─── POST /api/payments ───────────────────────────────────────────────────────
// Cashier marks a counter order as paid (Cash or GCash counter).
async function processPayment(req, res, next) {
  const client = await db.getClient();
  try {
    const { order_id, method, cash_given } = req.body;

    if (!order_id || !method) {
      return res.status(400).json({ message: 'order_id and method are required.' });
    }

    const allowed = ['cash', 'gcash', 'cash_on_delivery'];
    if (!allowed.includes(method)) {
      return res.status(400).json({ message: `method must be one of: ${allowed.join(', ')}` });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT o.id, o.status AS order_status, o.total_amount::float,
              p.id AS payment_id, p.status AS payment_status
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1
       FOR UPDATE`,
      [Number(order_id)]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    const { total_amount, payment_id, payment_status, order_status } = rows[0];

    if (payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order has already been paid.' });
    }

    if (order_status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order has been cancelled and cannot be paid.' });
    }

    if (method === 'cash') {
      const given = parseFloat(cash_given);
      if (isNaN(given) || given < total_amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Cash given (₱${isNaN(given) ? '?' : given.toFixed(2)}) must be at least the total (₱${total_amount.toFixed(2)}).`,
        });
      }
    }

    const { rows: payRows } = await client.query(
      `UPDATE payments
       SET method = $1, status = 'paid', paid_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [method, payment_id]
    );

    await client.query('COMMIT');

    const payment = payRows[0];
    const change  = method === 'cash'
      ? parseFloat((parseFloat(cash_given) - total_amount).toFixed(2))
      : null;

    res.json({ payment, change, message: 'Payment recorded successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/payments/:orderId ───────────────────────────────────────────────
async function getPaymentByOrder(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT p.*, o.total_amount::float, o.status AS order_status
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE p.order_id = $1`,
      [req.params.orderId]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Payment not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/payments/pending ────────────────────────────────────────────────
// Staff: list ALL unpaid GCash orders — counter, online, any channel.
// Returns: any GCash order where payment.status NOT IN ('paid','refunded')
//          and order.status NOT IN ('cancelled','completed').
// Covers: pending, awaiting_verification, rejected.
// ordered by submitted_at ASC NULLS LAST, order id ASC (oldest first).
async function getPendingPayments(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT
          o.id,
          o.id            AS order_id,
          'ORD-' || LPAD(o.id::text, 4, '0') AS order_number,
          o.customer_id,
          o.order_type,
          COALESCE(c.first_name || ' ' || c.last_name, c.email) AS customer_name,
          c.mobile_number  AS customer_mobile,
          o.total_amount::float,

          p.status         AS payment_status,
          p.gcash_ref_number,
          p.receipt_image_url,
          p.receipt_uploaded_at AS submitted_at,
          p.rejection_reason,

          COALESCE(
            json_agg(
              json_build_object(
                'name',       mi.name,
                'quantity',   oi.quantity,
                'unit_price', oi.unit_price::float
              )
              ORDER BY oi.id
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'
          ) AS items

       FROM orders o
       JOIN payments p ON p.order_id = o.id
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id

       WHERE p.method = 'gcash'
         AND p.status NOT IN ('paid', 'refunded')
         AND o.status NOT IN ('cancelled', 'completed')

       GROUP BY
         o.id, o.customer_id, o.total_amount, o.order_type,
         c.first_name, c.last_name, c.email, c.mobile_number,
         p.status, p.gcash_ref_number, p.receipt_image_url,
         p.receipt_uploaded_at, p.rejection_reason

       ORDER BY p.receipt_uploaded_at ASC NULLS LAST, o.id ASC`,
    );

    res.json({ payments: rows });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/payments/:orderId/verify ───────────────────────────────────────
// Staff confirms the GCash receipt is valid.
//   payment.status → 'paid'
//   order.status   → 'confirmed'
//   Emits Socket.io `new_order` → Kitchen Display
//   Emits Socket.io `payment:verified` → customer (future mobile push)
async function verifyPayment(req, res, next) {
  const client = await db.getClient();
  try {
    const orderId = Number(req.params.orderId);
    if (!orderId) return res.status(400).json({ message: 'Invalid order ID.' });

    await client.query('BEGIN');

    // Lock both rows together
    const { rows } = await client.query(
      `SELECT
          o.id, o.status AS order_status, o.customer_id,
          o.total_amount::float,
          p.id AS payment_id, p.status AS payment_status, p.method
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    const { order_status, payment_status, payment_id, method } = rows[0];

    if (method !== 'gcash') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only GCash orders need receipt verification.' });
    }

    if (payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This payment has already been verified.' });
    }

    if (!['pending', 'awaiting_verification', 'rejected'].includes(payment_status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Cannot verify a payment in '${payment_status}' state.` });
    }

    if (order_status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Cannot verify payment for a cancelled order.' });
    }

    // 1. Mark payment as paid
    await client.query(
      `UPDATE payments
       SET status = 'paid', paid_at = NOW(), verified_by = $1, verified_at = NOW(),
           rejection_reason = NULL
       WHERE id = $2`,
      [req.user.sub, payment_id]
    );

    // 2. Move order to 'confirmed' — kitchen still needs to acknowledge.
    //    Flow: pending → (staff verifies receipt) → confirmed → (kitchen acknowledges) → preparing → ready
    await client.query(
      `UPDATE orders SET status = 'confirmed' WHERE id = $1`,
      [orderId]
    );

    // 3. Log status change
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by)
       VALUES ($1, 'confirmed', $2)`,
      [orderId, req.user.sub]
    );

    await client.query('COMMIT');

    // 4. Fetch full order for kitchen socket event (status is now 'preparing')
    const { rows: orderRows } = await db.query(
      `SELECT
          o.*,
          'ORD-' || LPAD(o.id::text, 4, '0') AS order_number,
          COALESCE(
            json_agg(
              json_build_object(
                'name',       mi.name,
                'quantity',   oi.quantity,
                'unit_price', oi.unit_price::float,
                'notes',      oi.notes
              ) ORDER BY oi.id
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'
          ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       WHERE o.id = $1
       GROUP BY o.id`,
      [orderId]
    );

    const order = orderRows[0];
    if (order) {
      order.total_amount = parseFloat(order.total_amount);

      // 5. Push to kitchen as 'pending' so it lands in the New Orders banner
      //    and requires kitchen acknowledgement (pending → confirmed → preparing).
      //    The DB already has 'confirmed' for audit — this override is socket-only.
      socketHub.emitNewOrder({ ...order, status: 'pending' });

      // 6. Notify the customer — payment verified, order confirmed
      socketHub.emitPaymentVerified({ orderId, orderNumber: order.order_number, customerId: order.customer_id });
    }

    res.json({ success: true, message: 'Payment verified. Order sent to kitchen.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/payments/:orderId/reject ───────────────────────────────────────
// Staff rejects the receipt — customer is notified to re-upload.
// Body: { reason: string }
async function rejectPayment(req, res, next) {
  const client = await db.getClient();
  try {
    const orderId = Number(req.params.orderId);
    const { reason } = req.body;

    if (!orderId) return res.status(400).json({ message: 'Invalid order ID.' });
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A rejection reason is required.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT o.id, o.customer_id, o.status AS order_status,
              p.id AS payment_id, p.status AS payment_status, p.method
       FROM orders o
       JOIN payments p ON p.order_id = o.id
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    const { payment_id, payment_status, method, customer_id } = rows[0];

    if (method !== 'gcash') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only GCash orders can have receipts rejected.' });
    }

    if (payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Cannot reject a payment that has already been verified.' });
    }

    if (!['awaiting_verification', 'pending'].includes(payment_status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Cannot reject a payment in '${payment_status}' state.` });
    }

    // Mark payment as rejected with the reason
    await client.query(
      `UPDATE payments
       SET status = 'rejected', rejection_reason = $1
       WHERE id = $2`,
      [reason.trim(), payment_id]
    );

    await client.query('COMMIT');

    // Notify the staff payment queue + customer
    socketHub.emitPaymentRejected({
      orderId,
      customerId: customer_id,
      reason: reason.trim(),
    });

    res.json({ success: true, message: 'Receipt rejected. Customer notified to re-upload.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/webhooks/paymongo ──────────────────────────────────────────────
async function paymongoWebhook(req, res) {
  console.log('[webhook] PayMongo event (not yet processed):', req.body?.data?.attributes?.type);
  res.json({ received: true });
}

module.exports = {
  processPayment,
  getPaymentByOrder,
  getPendingPayments,
  verifyPayment,
  rejectPayment,
  paymongoWebhook,
};