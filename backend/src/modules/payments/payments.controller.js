const db = require('../../config/db');

// ─── POST /api/payments ───────────────────────────────────────────────────────
// Cashier marks a counter order as paid (Cash only for now).
// Flow:
//   1. POST /api/orders     → creates order, status='confirmed', payment='pending'
//   2. POST /api/payments   → cashier collects cash, marks payment as 'paid'
//
// GCash: placeholder — returns 501 until PayMongo is integrated.
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

    // GCash — not yet implemented
    if (method === 'gcash') {
      return res.status(501).json({
        message: 'GCash / PayMongo payment is not yet available. Please use Cash for now.',
      });
    }

    await client.query('BEGIN');

    // Fetch order + its payment record together
    const { rows } = await client.query(
      `SELECT o.id, o.status, o.total_amount::float,
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

    const { total_amount, payment_id, payment_status } = rows[0];

    if (payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order has already been paid.' });
    }

    // Cash: validate cash_given covers the total
    if (method === 'cash') {
      const given = parseFloat(cash_given);
      if (isNaN(given) || given < total_amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Cash given (₱${isNaN(given) ? '?' : given.toFixed(2)}) must be at least the total (₱${total_amount.toFixed(2)}).`,
        });
      }
    }

    // Update the payment row
    const { rows: payRows } = await client.query(
      `UPDATE payments
       SET method = $1, status = 'paid', paid_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [method, payment_id]
    );

    await client.query('COMMIT');

    const payment = payRows[0];
    const change = method === 'cash'
      ? parseFloat((parseFloat(cash_given) - total_amount).toFixed(2))
      : null;

    res.json({
      payment,
      change,
      message: 'Payment recorded successfully.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/payments/:orderId ───────────────────────────────────────────────
// Get payment info for a specific order.
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

// ─── POST /api/webhooks/paymongo ──────────────────────────────────────────────
// Stub — wire up when PayMongo is integrated.
async function paymongoWebhook(req, res) {
  console.log('[webhook] PayMongo event (not yet processed):', req.body?.data?.attributes?.type);
  res.json({ received: true });
}

module.exports = { processPayment, getPaymentByOrder, paymongoWebhook };