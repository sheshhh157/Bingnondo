/**
 * customer-orders.controller.js
 * ────────────────────────────────
 * Order endpoints for the customer app.
 *
 * The app talks to the SAME paths the staff console uses (/api/orders,
 * /api/orders/:id, ...) — only the token type differs. So instead of a
 * parallel URL space, the orders router branches on `req.user.type` and hands
 * customer tokens to the handlers below.
 *
 * Contracts (see lib/models/order_summary_model.dart, tracking_models.dart):
 *   GET  /api/orders                → { orders: [{ id, order_number, status,
 *                                        total_amount, item_count,
 *                                        payment_method, created_at }] }
 *   GET  /api/orders/:id            → { id, order_number, status,
 *                                        payment_method, total_amount,
 *                                        items: [{ menu_item_id, name,
 *                                        quantity, unit_price, note }],
 *                                        notes, delivery, created_at,
 *                                        updated_at, payment_status,
 *                                        rejection_reason, receipt_image_url }
 *   GET  /api/orders/:id/timeline   → { order_id, order_number, current_status,
 *                                        timeline: [{ status, label,
 *                                        changed_at, is_completed,
 *                                        is_current }] }
 *   GET  /api/orders/:id/status     → { id, status, can_cancel, payment_status }
 *   POST /api/orders/:id/cancel     → { message }
 *   POST /api/orders                → { id, order_number, status,
 *                                        total_amount, payment_url? }
 */

const db = require('../../config/db');
const socketHub = require('../../sockets');
const { __internal } = require('./orders.controller');
const { _resolveOrderItems } = __internal;
const { createCustomerNotification } = require('../customer/customer-notifications');
const { unlockThreadForCustomer, maybeLockThreadForCustomer } = require('../support-chat/support-chat.controller');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** 'ORD-0007' — the same format the staff console uses. */
function orderNumber(id) {
  return `ORD-${String(id).padStart(4, '0')}`;
}

/**
 * The app's payment vocabulary differs from the database's.
 * DB stores 'cash_on_delivery'; the app expects 'cod'.
 */
function toAppPaymentMethod(method) {
  return method === 'cash_on_delivery' ? 'cod' : method;
}

/** The order lifecycle the timeline stepper renders, in order. */
const TIMELINE_STEPS = [
  { status: 'pending', label: 'Order placed' },
  { status: 'confirmed', label: 'Order confirmed' },
  { status: 'preparing', label: 'Being prepared' },
  { status: 'ready', label: 'Ready for delivery' },
  { status: 'out_for_delivery', label: 'Out for delivery' },
  { status: 'completed', label: 'Delivered' },
];

/**
 * Load one order that belongs to this customer.
 * Returns null when the order does not exist OR belongs to someone else —
 * the app must not be able to probe for other customers' order ids.
 */
async function loadCustomerOrder(orderId, customerId) {
  const { rows } = await db.query(
    `SELECT o.id,
            o.order_number,
            o.status,
            o.total_amount::float,
            o.special_request,
            o.created_at,
            o.updated_at,
            o.delivery_address,
            o.delivery_latitude,
            o.delivery_longitude,
            p.method       AS payment_method,
            p.status       AS payment_status,
            p.gcash_ref_number,
            p.gcash_amount_sent::float,
            p.receipt_image_url,
            p.rejection_reason,
            d.delivery_preference,
            d.status        AS delivery_status,
            d.rider_name,
            d.rider_contact,
            d.lalamove_booking_id
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT method, status, gcash_ref_number, gcash_amount_sent,
                receipt_image_url, rejection_reason
           FROM payments
          WHERE order_id = o.id
          ORDER BY paid_at DESC NULLS LAST, id DESC
          LIMIT 1
       ) p ON TRUE
       LEFT JOIN deliveries d ON d.order_id = o.id
      WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, customerId]
  );
  return rows[0] || null;
}

/** The customer's restriction level ('none' when no row exists). */
async function restrictionLevel(customerId) {
  const { rows } = await db.query(
    'SELECT restriction_level FROM customer_restrictions WHERE customer_id = $1',
    [customerId]
  );
  return rows[0]?.restriction_level || 'none';
}

// ─── POST /api/orders (customer) ─────────────────────────────────────────────
/**
 * Body (PlaceOrderRequest.toJson):
 *   { order_type, order_channel, delivery_preference, payment_method,
 *     items: [{ menu_item_id, quantity, unit_price, note }],
 *     notes, gcash_receipt_temp_url, gcash_ref_number, gcash_amount_sent,
 *     delivery_address, delivery_latitude, delivery_longitude }
 */
async function placeOrder(req, res, next) {
  const client = await db.getClient();
  try {
    const customerId = req.user.sub;
    const body = req.body || {};

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return res.status(400).json({
        message: 'Your cart is empty.',
        code: 'items_unavailable',
      });
    }

    // Payment method: the app sends 'gcash' or 'cod'.
    const appMethod = body.payment_method;
    if (!['gcash', 'cod'].includes(appMethod)) {
      return res.status(400).json({ message: 'Choose a payment method to continue.' });
    }
    const dbMethod = appMethod === 'cod' ? 'cash_on_delivery' : 'gcash';

    // Gate 1 — account restrictions.
    const restriction = await restrictionLevel(customerId);
    if (restriction === 'suspended') {
      return res.status(403).json({
        message: 'Your account is suspended. Please contact support.',
        code: 'suspended',
      });
    }
    if (restriction === 'cod_restricted' && appMethod === 'cod') {
      return res.status(403).json({
        message: 'Cash on Delivery is not available for your account. Please use GCash.',
        code: 'cod_restricted',
      });
    }

    // Gate 2 — the profile gate. The app blocks checkout until the profile is
    // complete, but the server has to enforce it too.
    const { rows: customerRows } = await client.query(
      'SELECT address, mobile_number FROM customers WHERE id = $1',
      [customerId]
    );
    if (customerRows.length === 0) {
      return res.status(404).json({ message: 'Account not found.' });
    }
    const customer = customerRows[0];

    const deliveryAddress =
      (body.delivery_address && String(body.delivery_address).trim()) ||
      (customer.address && String(customer.address).trim());
    if (!deliveryAddress) {
      return res.status(403).json({
        message: 'Add a delivery address to your profile before ordering.',
        code: 'profile_incomplete',
      });
    }

    // Server-side pricing: the client sends unit_price, but the price that
    // counts is the one in the database.
    //
    // The app sends the per-item note as 'note'; the shared resolver reads
    // 'notes'. Both are accepted.
    const normalizedItems = items.map((item) => ({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      variant_id: item.variant_id ?? null,
      notes: item.note ?? item.notes ?? null,
    }));

    const resolved = await _resolveOrderItems(client, normalizedItems, {
      defaultVariant: true,
    });
    if (resolved.error) {
      return res.status(400).json({ message: resolved.error, code: 'items_unavailable' });
    }
    const { validated, totalAmount } = resolved;

    // GCash without a receipt cannot be verified later, so require one.
    const receiptUrl = body.gcash_receipt_temp_url ? String(body.gcash_receipt_temp_url) : null;
    if (dbMethod === 'gcash' && !receiptUrl) {
      return res.status(400).json({
        message: 'Please upload your GCash receipt before placing the order.',
        code: 'receipt_required',
      });
    }

    await client.query('BEGIN');

    // 1. The order
    //    order_number is left NULL on insert: the column carries a UNIQUE
    //    index, so a placeholder like 'ORD-TMP' would collide as soon as a
    //    second app order is placed. It is filled in below, once the
    //    sequence has handed us the real id.
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders
         (order_type, customer_id, status, order_channel, total_amount,
          special_request, order_number, delivery_address,
          delivery_latitude, delivery_longitude)
       VALUES ('online', $1, 'pending', 'mobile_app', $2, $3, NULL,
               $4, $5, $6)
       RETURNING *`,
      [
        customerId,
        totalAmount,
        body.notes ? String(body.notes).trim() : null,
        deliveryAddress,
        body.delivery_latitude ?? null,
        body.delivery_longitude ?? null,
      ]
    );
    const order = orderRows[0];

    // Now that the id is known, stamp the human-readable order number.
    // 'ORD-0007' — the same format the staff console computes on the fly.
    const { rows: numberRows } = await client.query(
      `UPDATE orders SET order_number = $1 WHERE id = $2 RETURNING order_number`,
      [orderNumber(order.id), order.id]
    );
    order.order_number = numberRows[0].order_number;

    // 2. Line items
    for (const item of validated) {
      await client.query(
        `INSERT INTO order_items
           (order_id, menu_item_id, variant_id, variant_name, quantity, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, item.menu_item_id, item.variant_id, item.variant_name,
         item.quantity, item.unit_price, item.notes]
      );
    }

    // 3. Status history
    //    changed_by has a FK to staff_accounts — a customer is not a staff
    //    account, so the actor stays NULL and the order itself identifies
    //    who moved it (the app's customer actions are recorded by status).
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'pending', NULL)`,
      [order.id]
    );

    // 4. Payment row. One row per order (unique index on payments.order_id).
    //    GCash waits for staff verification; COD waits for delivery.
    const paymentStatus = dbMethod === 'gcash' ? 'awaiting_verification' : 'pending';
    const { rows: paymentRows } = await client.query(
      `INSERT INTO payments
         (order_id, method, amount, status, gcash_ref_number, gcash_amount_sent,
          receipt_image_url, receipt_uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        order.id,
        dbMethod,
        totalAmount,
        paymentStatus,
        body.gcash_ref_number ? String(body.gcash_ref_number).trim() : null,
        body.gcash_amount_sent !== undefined && body.gcash_amount_sent !== null && body.gcash_amount_sent !== ''
          ? parseFloat(body.gcash_amount_sent)
          : null,
        receiptUrl,
        receiptUrl ? new Date() : null,
      ]
    );

    // 5. Delivery row — 'own_delivery' pending a rider.
    const deliveryPreference = body.delivery_preference === 'lalamove' ? 'lalamove' : 'own_delivery';
    await client.query(
      `INSERT INTO deliveries (order_id, delivery_preference, status)
       VALUES ($1, $2, 'pending_assignment')`,
      [order.id, deliveryPreference]
    );

    // 6. Support chat unlocks while the customer has an active order.
    await unlockThreadForCustomer(customerId, client);

    await client.query('COMMIT');

    // ── After commit: sockets and notifications ──────────────────────────────

    const orderPayload = {
      ...order,
      total_amount: parseFloat(order.total_amount),
      items: validated,
      payment: paymentRows[0],
    };

    if (dbMethod === 'gcash') {
      // Not paid yet — the order goes to the staff receipt queue, and reaches
      // the kitchen only once staff verifies the receipt.
      socketHub.emitPaymentPending({
        orderId: order.id,
        orderNumber: order.order_number,
        customerId,
        customerName: null,
        totalAmount: parseFloat(order.total_amount),
      });
    } else {
      // Cash on delivery is already committed — send it to the kitchen.
      socketHub.emitNewOrder(orderPayload);
    }

    await createCustomerNotification({
      customerId,
      type: dbMethod === 'gcash' ? 'payment_received' : 'order_pending',
      message:
        dbMethod === 'gcash'
          ? 'We received your GCash receipt. Your order is being checked.'
          : 'Order placed. Waiting for the cafe to confirm.',
      relatedOrderId: order.id,
    });

    return res.status(201).json({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_amount: parseFloat(order.total_amount),
      payment_method: toAppPaymentMethod(dbMethod),
      payment_url: null,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // The transaction was never opened (or already closed) — nothing to undo.
    }
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/orders (customer) ──────────────────────────────────────────────
async function listMyOrders(req, res, next) {
  try {
    const customerId = req.user.sub;

    const { rows } = await db.query(
      `SELECT
         o.id,
         'ORD-' || LPAD(o.id::text, 4, '0') AS order_number,
         o.status,
         o.total_amount::float,
         o.created_at,
         COALESCE(SUM(oi.quantity), 0)::int AS item_count,
         p.method AS payment_method
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT method FROM payments
          WHERE order_id = o.id
          ORDER BY paid_at DESC NULLS LAST, id DESC
          LIMIT 1
       ) p ON TRUE
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = $1
       GROUP BY o.id, p.method
       ORDER BY o.created_at DESC`,
      [customerId]
    );

    return res.status(200).json({
      orders: rows.map((row) => ({
        ...row,
        payment_method: toAppPaymentMethod(row.payment_method),
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/orders/:id (customer) ──────────────────────────────────────────
async function getMyOrder(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order id.' });
    }

    const order = await loadCustomerOrder(orderId, req.user.sub);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const { rows: itemRows } = await db.query(
      `SELECT oi.menu_item_id,
              mi.name,
              oi.quantity,
              oi.unit_price::float,
              oi.notes
         FROM order_items oi
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = $1
        ORDER BY oi.id`,
      [orderId]
    );

    return res.status(200).json({
      id: order.id,
      order_number: order.order_number || orderNumber(order.id),
      status: order.status,
      payment_method: toAppPaymentMethod(order.payment_method),
      total_amount: order.total_amount,
      items: itemRows.map((item) => ({
        menu_item_id: item.menu_item_id,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        // The app reads the per-item note from 'note'.
        note: item.notes ?? null,
        notes: item.notes ?? null,
      })),
      notes: order.special_request ?? null,
      delivery: {
        preference: order.delivery_preference || 'own_delivery',
        status: order.delivery_status || 'pending_assignment',
        rider_name: order.rider_name ?? null,
        rider_contact: order.rider_contact ?? null,
        lalamove_booking_id: order.lalamove_booking_id ?? null,
      },
      created_at: order.created_at,
      updated_at: order.updated_at,
      payment_status: order.payment_status ?? null,
      rejection_reason: order.rejection_reason ?? null,
      receipt_image_url: order.receipt_image_url ?? null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/orders/:id/timeline (customer) ─────────────────────────────────
async function getMyOrderTimeline(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order id.' });
    }

    const order = await loadCustomerOrder(orderId, req.user.sub);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    const { rows: history } = await db.query(
      `SELECT status, changed_at
         FROM order_status_history
        WHERE order_id = $1
        ORDER BY changed_at ASC, id ASC`,
      [orderId]
    );

    const reached = new Map();
    for (const row of history) {
      if (!reached.has(row.status)) reached.set(row.status, row.changed_at);
    }

    const currentStatus = order.status;
    // A cancelled order has no step in the forward timeline — it is reported
    // as its own terminal state.
    const isCancelled = currentStatus === 'cancelled';

    const timeline = TIMELINE_STEPS.map((step) => ({
      status: step.status,
      label: step.label,
      changed_at: reached.get(step.status) ?? null,
      is_completed: reached.has(step.status),
      is_current: step.status === currentStatus,
    }));

    if (isCancelled) {
      timeline.push({
        status: 'cancelled',
        label: 'Cancelled',
        changed_at: reached.get('cancelled') ?? null,
        is_completed: true,
        is_current: true,
      });
    }

    return res.status(200).json({
      order_id: order.id,
      order_number: order.order_number || orderNumber(order.id),
      current_status: currentStatus,
      timeline,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/orders/:id/status (customer) ───────────────────────────────────
async function getMyOrderStatus(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order id.' });
    }

    const order = await loadCustomerOrder(orderId, req.user.sub);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    return res.status(200).json({
      id: order.id,
      status: order.status,
      can_cancel: order.status === 'pending' && order.payment_status !== 'paid',
      payment_status: order.payment_status ?? null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/orders/:id/cancel (customer) ──────────────────────────────────
async function cancelMyOrder(req, res, next) {
  const client = await db.getClient();
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order id.' });
    }
    const customerId = req.user.sub;

    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT o.id, o.status, o.customer_id,
              (SELECT p.status FROM payments p
                WHERE p.order_id = o.id
                ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
                LIMIT 1) AS payment_status
         FROM orders o
        WHERE o.id = $1 AND o.customer_id = $2
        FOR UPDATE`,
      [orderId, customerId]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }

    const order = rows[0];

    if (order.payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'This order has already been paid. Please contact support.',
      });
    }
    if (order.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `This order can no longer be cancelled (status: ${order.status}).`,
      });
    }

    await client.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [orderId]
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'cancelled', NULL)`,
      [orderId]
    );

    await client.query('COMMIT');

    // No active order left → the support thread locks again.
    await maybeLockThreadForCustomer(customerId);

    socketHub.emitOrderStatus({
      orderId,
      orderNumber: orderNumber(orderId),
      status: 'cancelled',
    });
    socketHub.emitCustomerOrderStatus({ orderId, status: 'cancelled', customerId });

    await createCustomerNotification({
      customerId,
      type: 'order_cancelled',
      message: 'Your order was cancelled.',
      relatedOrderId: orderId,
    });

    return res.status(200).json({ message: 'Order cancelled.' });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // No open transaction — nothing to undo.
    }
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  placeOrder,
  listMyOrders,
  getMyOrder,
  getMyOrderTimeline,
  getMyOrderStatus,
  cancelMyOrder,
  // Exposed for tests
  __internal: { orderNumber, toAppPaymentMethod, TIMELINE_STEPS },
};
