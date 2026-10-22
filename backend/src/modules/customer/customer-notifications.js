/**
 * customer-notifications.js
 * ──────────────────────────
 * Customer-facing notification feed (mobile app).
 *
 * The existing `notifications` table is staff-shaped (staff_id / target_role /
 * reference_id) and is read by the staff bell on the web dashboard. Writing
 * customer rows into it would mix two different feeds in one table, so the app
 * gets its own `customer_notifications` table (created in config/ensureSchema.js).
 *
 * Every helper here does two things: persist the row, and push it to the
 * customer's socket room so the badge updates without a refresh.
 */

const db = require('../../config/db');
const socketHub = require('../../sockets');

/** Order status → notification type, mirroring the app's NotificationType. */
const TYPE_BY_STATUS = {
  pending: 'order_confirmed',
  confirmed: 'order_confirmed',
  preparing: 'order_preparing',
  ready: 'order_ready',
  out_for_delivery: 'order_out_for_delivery',
  completed: 'order_completed',
  cancelled: 'order_cancelled',
};

/** Order status → human-readable message. */
const MESSAGE_BY_STATUS = {
  pending: 'Your order has been placed and is waiting for the cafe to confirm it.',
  confirmed: 'Your order has been confirmed. We are on it!',
  preparing: 'Your order is being prepared.',
  ready: 'Your order is ready and on its way to you.',
  out_for_delivery: 'Your order is out for delivery.',
  completed: 'Your order has been delivered. Enjoy!',
  cancelled: 'Your order has been cancelled.',
};

/** 'ORD-0007' — the same format the staff console uses. */
function orderNumber(id) {
  return `ORD-${String(id).padStart(4, '0')}`;
}

/**
 * Persist a notification for a customer and push it over the socket.
 *
 * Never throws: a failed notification must not roll back the order/payment
 * change that triggered it. Failures are logged instead.
 *
 * @param {{ customerId:number, type:string, message:string, relatedOrderId?:number|null }} params
 * @returns {Promise<object|null>} the notification payload, or null on failure
 */
async function createCustomerNotification({ customerId, type, message, relatedOrderId = null }) {
  if (!customerId || !type) return null;

  try {
    const { rows } = await db.query(
      `INSERT INTO customer_notifications
         (customer_id, type, message, related_order_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, customer_id, type, message, related_order_id, is_read, created_at`,
      [customerId, type, message, relatedOrderId]
    );

    const row = rows[0];
    const payload = {
      id: row.id,
      type: row.type,
      message: row.message,
      is_read: row.is_read,
      related_order_id: row.related_order_id,
      related_order_number: row.related_order_id ? orderNumber(row.related_order_id) : null,
      created_at: row.created_at,
    };

    socketHub.emitCustomerNotification(customerId, payload);
    return payload;
  } catch (err) {
    console.error('[customerNotifications] create failed:', err.message);
    return null;
  }
}

/**
 * Notification for an order status change. No-op when the order has no
 * customer (a counter order placed at the till).
 *
 * @param {{ orderId:number, customerId:number|null, status:string }} params
 */
async function notifyOrderStatus({ orderId, customerId, status }) {
  if (!customerId) return null;
  const type = TYPE_BY_STATUS[status] || 'order_status';
  const message = MESSAGE_BY_STATUS[status] || `Your order is now ${status}.`;
  return createCustomerNotification({
    customerId,
    type,
    message,
    relatedOrderId: orderId,
  });
}

module.exports = {
  createCustomerNotification,
  notifyOrderStatus,
  orderNumber,
  TYPE_BY_STATUS,
  MESSAGE_BY_STATUS,
};
