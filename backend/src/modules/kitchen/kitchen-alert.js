/**
 * kitchen-alert.js
 * ────────────────
 * One place that creates the "ring the kitchen ESP32" alert, so every path that
 * marks an order PAID uses the same logic:
 *   - counter order created (orders.controller.createOrder, born paid)
 *   - counter payment recorded (payments.controller.processPayment)
 *   - GCash receipt verified (payments.controller.verifyPayment)
 *
 * Usage (inside the caller's transaction, before COMMIT):
 *     const kitchenAlert = await createKitchenAlert(client, orderId);
 *     await client.query('COMMIT');
 *     announceKitchenAlert(kitchenAlert);      // after COMMIT
 *
 * It never breaks the sale: the insert runs in a SAVEPOINT, so if the ESP32
 * device row is missing (migration not run) or anything else goes wrong, the
 * order/payment still commits and only the alert is skipped (logged).
 * One alert per order: calling it twice for the same order does nothing.
 */
const socketHub = require('../../sockets');

async function createKitchenAlert(client, orderId) {
  const deviceCode = process.env.ESP32_DEVICE_CODE || 'ESP32-KitchenA';
  await client.query('SAVEPOINT kitchen_alert');
  try {
    const { rows } = await client.query(
      `WITH dev AS (
         SELECT id, location_label FROM esp32_devices WHERE device_code = $2
       ),
       ins AS (
         INSERT INTO kitchen_alerts (order_id, device_id)
         SELECT $1::int, dev.id FROM dev
          WHERE NOT EXISTS (SELECT 1 FROM kitchen_alerts ka WHERE ka.order_id = $1::int)
         RETURNING id, order_id, device_id
       )
       SELECT ins.id, ins.order_id, ins.device_id, dev.location_label
         FROM ins JOIN dev ON dev.id = ins.device_id`,
      [orderId, deviceCode]
    );
    await client.query('RELEASE SAVEPOINT kitchen_alert');
    return rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT kitchen_alert');
    console.error('[kitchen-alert] skipped (order still saved):', err.message);
    return null;
  }
}

function announceKitchenAlert(alert) {
  if (!alert) return;
  socketHub.emitKitchenAlert({
    alertId: alert.id,
    orderId: alert.order_id,
    orderNumber: `ORD-${String(alert.order_id).padStart(4, '0')}`,
    deviceId: alert.device_id,
    locationLabel: alert.location_label,
  });
}

module.exports = { createKitchenAlert, announceKitchenAlert };
