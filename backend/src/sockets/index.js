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
 *   order:new          → manager: new order arrived (dashboard + oversight)
 *   order:status       → all rooms: order status changed
 *   order:ready        → staff/manager: order ready, needs delivery assignment
 *   menu_update        → all: menu item availability changed (shared with menu.controller)
 *   inventory:update   → staff/manager: stock level changed
 *   kitchen_alert      → kitchen + esp32:<id>: new alert, fire buzzer
 *   kitchen_alert:ack  → esp32:<id>: alert acknowledged, stop buzzer
 *   delivery:update    → staff/manager: delivery status changed
 *
 * Pattern: setIO(io) is called from server.js — same pattern as menu.controller.
 *
 * Manager-room authorization
 * ──────────────────────────
 * The `manager` room carries owner-level data (all-orders revenue, inventory
 * levels, kitchen queue), so membership is derived from the JWT presented in
 * the Socket.IO handshake rather than from a client-supplied room name. The
 * provider passes `auth: cb => cb({ token })` so the token is re-read on every
 * reconnect attempt, which matters because apiClient silently rotates the
 * access token while the tab is open.
 *
 * Every other room is deliberately left on the legacy unvalidated `join` path
 * so the cashier / kitchen / staff / ESP32 clients keep working untouched.
 */

const { verifyAccessToken } = require('../modules/auth/auth.jwt');

/** Role → rooms the role is entitled to. The client is server-authoritative:
 * membership is derived from the handshake token, never from `join` alone. */
const ROOMS_BY_ROLE = {
  cashier:       ['cashier'],
  kitchen_staff: ['kitchen'],
  staff:         ['staff'],
  owner:         ['manager'],
  manager:       ['manager'],
  admin:         ['manager', 'kitchen'],
};

let _io = null;

/** Resolve the handshake token to a staff user, or null. */
function resolveUser(handshakeAuth) {
  const token = handshakeAuth && handshakeAuth.token;
  if (!token) return null;
  const decoded = verifyAccessToken(token);
  if (!decoded || decoded.type !== 'staff') return null;
  return decoded;
}

function allowedRooms(user) {
  return ROOMS_BY_ROLE[user?.role] || [];
}

function setIO(io) {
  _io = io;

  // No anonymous sockets. The ESP32 polls HTTP (/api/esp32/alert); every UI
  // tab is a signed-in staff session, so a missing or invalid token is a hard
  // reject, not a quiet downgrade.
  io.use((socket, next) => {
    const user = resolveUser(socket.handshake.auth);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`[socket] Client connected: ${socket.id} role=${user.role} (total: ${io.engine.clientsCount})`);

    // Rooms follow from the token role — the same list the `join` handler
    // enforces, so a forged join cannot gain anything.
    for (const room of allowedRooms(user)) socket.join(room);

    // The access token lapses mid-session; without a server-side cutoff the
    // socket would stream live data to an unauthenticated tab forever.
    const cutoffMs = user.exp ? Math.max(0, user.exp * 1000 - Date.now()) : null;
    if (cutoffMs != null) {
      const timer = setTimeout(() => socket.disconnect(true), cutoffMs);
      socket.on('disconnect', () => clearTimeout(timer));
    }

    // The `join` handler may only take a room the caller is already allowed to
    // be in (validating against the auto-joined set). Anything else is a no-op.
    socket.on('join', ({ room } = {}) => {
      if (!room) return;
      if (!allowedRooms(user).includes(room)) {
        console.warn(`[socket] ${socket.id} refused room: ${room} (role: ${user.role})`);
        return;
      }
      socket.join(room);
    });

    socket.on('leave', ({ room } = {}) => {
      if (!room) return;
      socket.leave(room);
      console.log(`[socket] ${socket.id} left room: ${room}`);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] Client disconnected: ${socket.id}`);
    });
  });
}

// ─── Emitter helpers (called from route controllers) ──────────────────────────

/**
 * The order-creation payload (see orders.controller.createOrder) carries its
 * line items under `items`, while GET /api/kitchen/orders exposes them as
 * `order_items` with the menu name resolved. Manager pages read both shapes —
 * `normalizeLiveOrder` (utils/format.js) and the sales tables expect `items`,
 * the oversight kitchen cards iterate `order_items`. Build one payload that
 * satisfies both so a live-pushed order renders exactly like a fetched one.
 */
function toManagerOrderPayload(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return {
    ...order,
    items,
    order_items: items.map((item, i) => ({
      id: order.id != null ? `${order.id}-${i + 1}` : i + 1,
      menu_item_id: item.menu_item_id ?? null,
      name: item.name ?? null,
      quantity: item.quantity ?? 1,
      unit_price: item.unit_price ?? null,
      notes: item.notes ?? null,
      menu_item: { name: item.name ?? 'Unknown item' },
    })),
  };
}

function emitNewOrder(order) {
  if (!_io) return;
  // Kitchen display listens for `new_order` (KITCHEN_EVENTS.NEW_ORDER); it keeps
  // receiving the raw order-creation payload it has always received.
  _io.to('kitchen').emit('new_order', order);
  // Manager dashboard listens for `order:new` (useLiveData in the manager pages).
  _io.to('manager').emit('order:new', toManagerOrderPayload(order));
  console.log(`[socket] → new_order (kitchen) + order:new (manager): ${order.order_number}`);
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
  // Includes the shape the kitchen AlertPanel reads (id, order, esp32_device)
  // alongside the original camelCase fields.
  const payload = {
    id: alertId, alertId,
    order_id: orderId, orderId, orderNumber,
    order: { order_number: orderNumber },
    deviceId, locationLabel,
    esp32_device: deviceId ? { id: deviceId, location_label: locationLabel } : null,
    acknowledged_at: null,
  };
  _io.to('kitchen').emit('kitchen_alert', payload);
  if (deviceId) _io.to(`esp32:${deviceId}`).emit('kitchen_alert', payload);
  console.log(`[socket] → kitchen_alert: ${orderNumber}`);
}

function emitKitchenAlertAck({ alertId, deviceId }) {
  if (!_io) return;
  // The esp32:<id> room is not populated by the current firmware (it polls
  // HTTP rather than connecting to Socket.IO), so the real silence comes from
  // the acknowledged_at write plus the next poll. This emit only lets other
  // kitchen tabs drop the alert; the banner itself no longer exists.
  _io.to('kitchen').emit('kitchen_alert:ack', { alertId });
  if (deviceId) _io.to(`esp32:${deviceId}`).emit('kitchen_alert:ack', { alertId });
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