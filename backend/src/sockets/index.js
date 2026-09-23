/**
 * sockets/index.js
 * ─────────────────
 * Central Socket.io hub for Bingnondo.
 *
 * Rooms:
 *   cashier          — Cashier POS web app
 *   kitchen          — Kitchen display + ESP32 devices
 *   staff            — Staff management dashboard
 *   manager          — Owner/Manager dashboard (read-only)
 *   esp32:<deviceId> — Per-device room for hardware alert control
 *
 * Events emitted by backend:
 *   new_order          → kitchen: new confirmed order arrived
 *   order:status       → all rooms: order status changed
 *   order:ready        → staff/manager: order ready, needs delivery assignment
 *   menu_update        → all: menu item availability changed (shared with menu.controller)
 *   inventory:update   → staff/manager: stock level changed
 *   kitchen_alert      → kitchen + esp32:<id>: new alert, fire buzzer
 *   kitchen_alert:ack  → esp32:<id>: alert acknowledged, stop buzzer
 *   delivery:update    → staff/manager: delivery status changed
 *
 * Pattern: setIO(io) is called from server.js — same pattern as menu.controller.
 */

let _io = null;

function setIO(io) {
  _io = io;

  io.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id} (total: ${io.engine.clientsCount})`);

    // Client joins a role-based room after connecting
    socket.on('join', ({ room }) => {
      if (room) {
        socket.join(room);
        console.log(`[socket] ${socket.id} joined room: ${room}`);
      }
    });

    // ESP32 device registers itself — joins its private room
    socket.on('esp32:register', ({ device_id }) => {
      if (device_id) {
        socket.join(`esp32:${device_id}`);
        console.log(`[socket] ESP32 device ${device_id} registered on ${socket.id}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[socket] Client disconnected: ${socket.id}`);
    });
  });
}

// ─── Emitter helpers (called from route controllers) ──────────────────────────

function emitNewOrder(order) {
  if (!_io) return;
  _io.to('kitchen').emit('new_order', order);
  console.log(`[socket] → new_order: ${order.order_number}`);
}

function emitOrderStatus({ orderId, orderNumber, status }) {
  if (!_io) return;
  _io.to('kitchen').to('cashier').to('staff').to('manager')
     .emit('order:status', { orderId, orderNumber, status });
}

function emitOrderReady({ orderId, orderNumber }) {
  if (!_io) return;
  _io.to('staff').to('manager').emit('order:ready', { orderId, orderNumber });
}

// menu_update is already emitted by menu.controller via its own _io reference.
// This helper is provided for cases where other modules (e.g. inventory) need
// to trigger a menu availability change.
function emitMenuUpdate(item) {
  if (!_io) return;
  _io.emit('menu_update', item);
}

function emitInventoryUpdate(item) {
  if (!_io) return;
  _io.to('staff').to('manager').emit('inventory:update', item);
}

function emitKitchenAlert({ alertId, orderId, orderNumber, deviceId, locationLabel }) {
  if (!_io) return;
  const payload = { alertId, orderId, orderNumber, deviceId, locationLabel };
  _io.to('kitchen').emit('kitchen_alert', payload);
  if (deviceId) _io.to(`esp32:${deviceId}`).emit('kitchen_alert', payload);
  console.log(`[socket] → kitchen_alert: ${orderNumber}`);
}

function emitKitchenAlertAck({ alertId, deviceId }) {
  if (!_io) return;
  _io.to(`esp32:${deviceId}`).emit('kitchen_alert:ack', { alertId });
}

function emitDeliveryUpdate(delivery) {
  if (!_io) return;
  _io.to('staff').to('manager').emit('delivery:update', delivery);
}

module.exports = {
  setIO,
  emitNewOrder,
  emitOrderStatus,
  emitOrderReady,
  emitMenuUpdate,
  emitInventoryUpdate,
  emitKitchenAlert,
  emitKitchenAlertAck,
  emitDeliveryUpdate,
};