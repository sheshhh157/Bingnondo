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

/** Roles entitled to the owner-level `manager` room. */
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

/** The one room guarded by handshake auth. */
const MANAGER_ROOM = 'manager';

let _io = null;

/**
 * Resolve the handshake token to a staff user, if one was sent.
 * Returns null for absent, malformed, expired or non-staff tokens — the
 * connection is still allowed (ESP32 devices and any not-yet-updated client
 * connect without a token), it just can't reach the manager room.
 */
function resolveUser(handshakeAuth) {
  const token = handshakeAuth && handshakeAuth.token;
  if (!token) return null;
  const decoded = verifyAccessToken(token);
  if (!decoded || decoded.type !== 'staff') return null;
  return decoded;
}

function isManagerEntitled(user) {
  return Boolean(user) && MANAGER_ROLES.has(user.role);
}

function setIO(io) {
  _io = io;

  // Handshake auth. A token that is present but invalid is a hard reject so a
  // stale/expired client fails loudly instead of silently dropping to an
  // unauthenticated socket with no live data. An absent token is allowed.
  io.use((socket, next) => {
    const user = resolveUser(socket.handshake.auth);
    if (socket.handshake.auth && socket.handshake.auth.token && !user) {
      return next(new Error('unauthorized'));
    }
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id} (total: ${io.engine.clientsCount})`);

    // Auto-claim the manager room so membership survives every reconnect.
    if (isManagerEntitled(socket.data.user)) {
      socket.join(MANAGER_ROOM);
      console.log(`[socket] ${socket.id} auto-joined room: ${MANAGER_ROOM} (role: ${socket.data.user.role})`);
    }

    // Client joins a role-based room after connecting. The `= {}` default
    // guards a malformed emit (no payload) from throwing inside the handler.
    socket.on('join', ({ room } = {}) => {
      if (!room) return;

      // `manager` is the only guarded room: a socket may only claim it when
      // its handshake token carries an owner-level role. Other rooms keep the
      // legacy behaviour.
      if (room === MANAGER_ROOM) {
        if (!isManagerEntitled(socket.data.user)) {
          console.warn(`[socket] ${socket.id} refused room: ${room} (not entitled)`);
          return;
        }
        socket.join(room);
        console.log(`[socket] ${socket.id} joined room: ${room}`);
        return;
      }

      socket.join(room);
      console.log(`[socket] ${socket.id} joined room: ${room}`);
    });

    // Leave a room explicitly. Needed because the client discards its token on
    // sign-out but the server has no way to notice on its own — without this, a
    // signed-out tab stayed in the `manager` room and kept receiving events.
    // Leaving is never an escalation, so this is unguarded.
    socket.on('leave', ({ room } = {}) => {
      if (!room) return;
      socket.leave(room);
      console.log(`[socket] ${socket.id} left room: ${room}`);
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

// ─── §4.0 Payment Verification Events ────────────────────────────────────────

/**
 * emitPaymentPending
 * Customer uploaded a GCash receipt → staff payment queue updates in real time.
 * @param {{ orderId, orderNumber, customerId, customerName, totalAmount }} payload
 */
function emitPaymentPending(payload) {
  if (!_io) return;
  _io.to('staff').to('manager').emit('payment:pending', payload);
  console.log(`[socket] → payment:pending: ${payload.orderNumber}`);
}

/**
 * emitPaymentVerified
 * Staff verified receipt → customer app notified (order is now confirmed).
 * @param {{ orderId, orderNumber, customerId }} payload
 */
function emitPaymentVerified(payload) {
  if (!_io) return;
  // Staff & manager: remove the row from their queue
  _io.to('staff').to('manager').emit('payment:verified', payload);
  // Customer: their order is now confirmed (mobile app listens for this)
  if (payload.customerId) {
    _io.to(`customer:${payload.customerId}`).emit('payment:verified', payload);
  }
  console.log(`[socket] → payment:verified: ${payload.orderNumber}`);
}

/**
 * emitPaymentRejected
 * Staff rejected receipt → customer notified to re-upload.
 * @param {{ orderId, customerId, reason }} payload
 */
function emitPaymentRejected(payload) {
  if (!_io) return;
  // Staff & manager: update row status in the queue in real time
  _io.to('staff').to('manager').emit('payment:rejected', payload);
  // Customer: prompt re-upload on mobile app
  if (payload.customerId) {
    _io.to(`customer:${payload.customerId}`).emit('payment:rejected', payload);
  }
  console.log(`[socket] → payment:rejected: order ${payload.orderId}`);
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
  emitPaymentPending,
  emitPaymentVerified,
  emitPaymentRejected,
};