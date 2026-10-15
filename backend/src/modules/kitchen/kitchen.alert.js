const socketHub = require('../../sockets');

/**
 * Kitchen buzzer alert helper.
 * ─────────────────────────────
 * When an order is paid, the kitchen's ESP32 buzzer must ring. That needs a
 * `kitchen_alerts` row (the device polls for unacknowledged ones) plus a
 * Socket.io `kitchen_alert` event (so the kitchen web panel shows it live).
 *
 * `createAlert` runs INSIDE the caller's transaction so a paid order always has
 * its alert — either both commit or both roll back. `emitAlert` runs AFTER the
 * commit, because emitting for a row that later rolls back would ring a buzzer
 * for an order that does not exist.
 *
 * Device selection is by `ESP32_DEVICE_CODE` (default 'ESP32-KitchenA'). The
 * backend currently drives a single buzzer; if more devices are added later,
 * fan out by inserting one alert row per `esp32_devices` row here.
 */

const DEFAULT_DEVICE_CODE = 'ESP32-KitchenA';

/**
 * Insert a kitchen alert for `orderId` using the caller's DB client/transaction.
 * Returns the alert row (with the device's location label) or null when the
 * device row is missing — a missing device must never fail the sale.
 *
 * @param {import('pg').PoolClient} client  a client with an open transaction
 * @param {number} orderId
 */
async function createAlert(client, orderId) {
  const { rows: devRows } = await client.query(
    `SELECT id, location_label
       FROM esp32_devices
      WHERE device_code = $1`,
    [process.env.ESP32_DEVICE_CODE || DEFAULT_DEVICE_CODE]
  );
  if (!devRows[0]) return null;

  const { rows } = await client.query(
    `INSERT INTO kitchen_alerts (order_id, device_id)
     VALUES ($1, $2)
     RETURNING id, order_id, device_id`,
    [Number(orderId), devRows[0].id]
  );

  return { ...rows[0], location_label: devRows[0].location_label };
}

/**
 * Broadcast a created alert to the kitchen panel + the device's private room.
 * Call this only after the transaction that inserted the alert has committed.
 */
function emitAlert(alert) {
  if (!alert) return;
  socketHub.emitKitchenAlert({
    alertId: alert.id,
    orderId: alert.order_id,
    orderNumber: `ORD-${String(alert.order_id).padStart(4, '0')}`,
    deviceId: alert.device_id,
    locationLabel: alert.location_label,
  });
}

module.exports = { createAlert, emitAlert };
