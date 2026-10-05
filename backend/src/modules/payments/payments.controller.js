const db = require('../../config/db');
const socketHub = require('../../sockets');

// Deduct linked ingredients from inventory after a successful payment.
// Idempotent: a unique index on reference_order_id + inventory_item_id
// prevents double deduction if the same payment is processed again.
async function deductInventory(client, orderId, cashierId) {
  const { rows } = await client.query(
    `SELECT mii.inventory_item_id,
            SUM(oi.quantity * mii.quantity_required) AS deduction
     FROM order_items oi
     JOIN menu_item_ingredients mii ON mii.menu_item_id = oi.menu_item_id
     WHERE oi.order_id = $1
       AND mii.quantity_required > 0
     GROUP BY mii.inventory_item_id
     ORDER BY mii.inventory_item_id`,
    [orderId]
  );
  const updatedItems = [];
  for (const row of rows) {
    const ded = parseFloat(row.deduction);
    const inserted = await client.query(
      `INSERT INTO inventory_transactions (inventory_item_id, change_type, quantity, performed_by, reference_order_id)
       VALUES ($1, 'deduction', $2, $3, $4)
       ON CONFLICT (reference_order_id, inventory_item_id) WHERE change_type = 'deduction' AND reference_order_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [row.inventory_item_id, -ded, cashierId, orderId]
    );
    if (inserted.rows.length > 0) {
      const update = await client.query(
        'UPDATE inventory_items SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2 RETURNING current_stock',
        [ded, row.inventory_item_id]
      );
      const newStock = parseFloat(update.rows[0].current_stock);
      updatedItems.push({ itemId: Number(row.inventory_item_id), currentStock: newStock });
    }
  }
  return updatedItems;
}


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
      `SELECT o.id, o.status AS order_status, o.total_amount::float,
              o.order_type,
               o.cashier_id,
               p.id AS payment_id, p.status AS payment_status
        FROM orders o
        LEFT JOIN payments p ON p.order_id = o.id
        WHERE o.id = $1
        FOR UPDATE OF o`,
      [Number(order_id)]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    const { total_amount, payment_id, payment_status, order_status, cashier_id } = rows[0];
    const orderType = rows[0].order_type || 'counter';

    // A cashier is confined to their own orders. owner / admin / staff act as
    // a supervisor override, mirroring the scoping `buildOrderFilters` applies
    // to the order list. Without this any cashier could mark another's order
    // paid, and the read scoping meant the victim could not see it happen.
    // An unowned order (cashier_id NULL) is not "someone else's" — see
    // ownsOrder in orders.controller.js, which applies the same rule.
    const ownsIt = req.user.role !== 'cashier'
      || cashier_id === null
      || cashier_id === undefined
      || Number(cashier_id) === Number(req.user.sub);
    if (!ownsIt) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'You can only act on your own orders.' });
    }

    // LEFT JOIN above means an order with no payment row now surfaces as a
    // distinct, accurate error instead of being indistinguishable from a
    // missing order. It used to be an INNER JOIN, so such orders reported
    // "Order not found." and were permanently unpayable.
    if (!payment_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'This order has no payment record, so it cannot be settled. Ask a manager to void and recreate it.',
      });
    }

    if (payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order has already been paid.' });
    }

    // Never take money for a cancelled order. Without this, a payment could
    // land after a cancellation and the two would disagree: the report counts
    // revenue only when the payment is 'paid' and the order is not
    // 'cancelled', so the money would be collected but reported nowhere.
    //
    // Checked after the row lock above, and the same order row is locked by
    // `POST /api/orders/:id/cancel`, so a payment and a cancellation cannot
    // interleave — one of these two checks always sees the other's result.
    if (order_status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This order has been cancelled and cannot be paid.' });
    }

    // Channel-method pairing: a counter order cannot be "cash on delivery"
    // (the customer is standing at the counter), and COD is only offered for
    // online orders. Without this, a POS slip could mark a walk-up order paid
    // with a method where no money ever arrives, and still ring the buzzer.
    if (orderType === 'counter' && method !== 'cash') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Counter orders can only be paid with cash.' });
    }
    if (method === 'cash_on_delivery' && orderType !== 'online') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Cash on delivery is only available for online orders.' });
    }

    // Cash: validate cash_given covers the total
    if (method === 'cash') {
      const givenCentavos = Math.round(parseFloat(cash_given) * 100);
      const totalCentavos = Math.round(parseFloat(total_amount) * 100);
      if (isNaN(givenCentavos) || givenCentavos < totalCentavos) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Cash given (₱${isNaN(givenCentavos) ? '?' : (givenCentavos/100).toFixed(2)}) must be at least the total (₱${(totalCentavos/100).toFixed(2)}).`,
        });
      }
    }

    const cashCentavos = method === 'cash' ? Math.round(parseFloat(cash_given) * 100) : null;
    const changeCentavos = method === 'cash' ? (cashCentavos - Math.round(parseFloat(total_amount) * 100)) : null;

    // Update the payment row
    const { rows: payRows } = await client.query(
      `UPDATE payments
       SET method = $1, status = 'paid', paid_at = NOW(), cash_given = $3, change_given = $4
       WHERE id = $2
       RETURNING *`,
      [method, payment_id, cashCentavos !== null ? (cashCentavos / 100).toFixed(2) : null, changeCentavos !== null ? (changeCentavos / 100).toFixed(2) : null]
    );

    const updatedItems = await deductInventory(client, order_id, cashier_id);

    // Paid -> ring the kitchen buzzer. Same transaction as the payment, so a
    // paid order always has its alert. If the device row is missing we skip the
    // alert rather than fail the sale.
    let alert = null;
    const { rows: devRows } = await client.query(
      `SELECT id, location_label FROM esp32_devices WHERE device_code = $1`,
      [process.env.ESP32_DEVICE_CODE || 'ESP32-KitchenA']
    );
    if (devRows[0]) {
      const { rows: alertRows } = await client.query(
        `INSERT INTO kitchen_alerts (order_id, device_id)
         VALUES ($1, $2)
         RETURNING id, order_id, device_id`,
        [Number(order_id), devRows[0].id]
      );
      alert = { ...alertRows[0], location_label: devRows[0].location_label };
    }

    try {
      await client.query('SAVEPOINT sp_audit');
      await client.query(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
         VALUES ($1, 'payment_paid', 'order', $2, $3)`,
        [req.user.sub, order_id, JSON.stringify({ amount: parseFloat(total_amount).toFixed(2), method, cash_given, change: changeCentavos !== null ? (changeCentavos / 100).toFixed(2) : null })]
      );
      await client.query('RELEASE SAVEPOINT sp_audit');
    } catch (err) {
      console.error('[audit_log] insert failed during payment:', err);
      try { await client.query('ROLLBACK TO SAVEPOINT sp_audit'); } catch {}
    }

    await client.query('COMMIT');

    // Counter orders are promoted to kitchen only once paid.
    if (orderType === 'counter') {
      const orderRes = await client.query(
        `SELECT id, status, order_type, order_channel, total_amount::float, created_at, cashier_id
         FROM orders WHERE id = $1`,
        [Number(order_id)]
      );
      const itemsRes = await client.query(
        `SELECT oi.id, oi.menu_item_id, mi.name, oi.quantity, oi.unit_price::float, oi.notes, oi.menu_item_option_id, moi.name AS option_name, oi.menu_item_flavor_id, mfi.name AS flavor_name
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         LEFT JOIN menu_item_options moi ON moi.id = oi.menu_item_option_id
         LEFT JOIN menu_item_options mfi ON mfi.id = oi.menu_item_flavor_id
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [Number(order_id)]
      );
      const order = orderRes.rows[0];
      order.order_number = `ORD-${String(order.id).padStart(4, '0')}`;
      order.items = itemsRes.rows.map((row) => ({
        menu_item_id: row.menu_item_id,
        menu_item_option_id: row.menu_item_option_id,
        option_name: row.option_name,
        menu_item_flavor_id: row.menu_item_flavor_id,
        flavor_name: row.flavor_name,
        name: row.name,
        unit_price: Number(row.unit_price),
        quantity: row.quantity,
        notes: row.notes,
      }));
      socketHub.emitNewOrder(order);
    }

    if (updatedItems && updatedItems.length > 0) {
      for (const item of updatedItems) {
        socketHub.emitInventoryUpdate({ itemId: item.itemId, currentStock: item.currentStock });
      }
    }

    if (alert) {
      socketHub.emitKitchenAlert({
        alertId: alert.id,
        orderId: alert.order_id,
        orderNumber: `ORD-${String(alert.order_id).padStart(4, '0')}`,
        deviceId: alert.device_id,
        locationLabel: alert.location_label,
      });
    }

    const payment = payRows[0];
    const change = method === 'cash'
      ? (Math.round(parseFloat(cash_given) * 100) - Math.round(parseFloat(total_amount) * 100)) / 100
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