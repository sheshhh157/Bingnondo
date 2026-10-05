/**
 * Socket.IO handshake auth + server-derived rooms (backend hardening pass).
 *
 * The server must reject anonymous and badly-signed sockets outright, refuse a
 * cashier any room beyond `cashier`, auto-join each role's rooms, keep
 * kitchen/manager events out of the cashier socket, and silently drop the
 * old unauthenticated `esp32:register` path.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');

const socketHub = require('../src/sockets');

const signFor = (role, { expiresIn = '5m' } = {}) =>
  jwt.sign({ sub: 1, type: 'staff', role }, process.env.JWT_ACCESS_SECRET, { expiresIn });

async function startHub() {
  const server = http.createServer();
  const io = new Server(server);
  socketHub.setIO(io);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, io, port: server.address().port };
}

const connect = (port, token) => ioc(`http://127.0.0.1:${port}`, {
  auth: (cb) => cb({ token }),
  reconnection: false,
  transports: ['websocket'],
});

const waitConnected = (s) => new Promise((resolve, reject) => {
  s.once('connect', resolve);
  s.once('connect_error', reject);
});

const waitConnectError = (s) => new Promise((resolve) => {
  s.once('connect_error', (err) => resolve(err.message));
});

const waitEvent = (s, name, timeoutMs = 2000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeoutMs);
  s.once(name, (payload) => { clearTimeout(timer); resolve(payload); });
});

/** Returns a flag object; poll it after the wait window. */
const track = (s, name) => {
  const state = { received: false, payload: null };
  s.on(name, (p) => { state.received = true; state.payload = p; });
  return state;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const fakeOrder = () => ({
  id: 4242,
  order_number: 'ORD-4242',
  status: 'pending',
  total_amount: 0,
  items: [],
});

async function stopAll(clients, { server, io }) {
  for (const c of clients) if (c.connected) c.disconnect();
  io.close();
  await new Promise((r) => server.close(r));
}

test('no token is rejected', async () => {
  const hub = await startHub();
  try {
    const s = connect(hub.port, undefined);
    const msg = await waitConnectError(s);
    assert.equal(msg, 'unauthorized');
    s.close();
  } finally {
    await stopAll([], hub);
  }
});

test('a garbage token is rejected', async () => {
  const hub = await startHub();
  try {
    const s = connect(hub.port, 'not-a-jwt');
    const msg = await waitConnectError(s);
    assert.equal(msg, 'unauthorized');
    s.close();
  } finally {
    await stopAll([], hub);
  }
});

test('an expired token is rejected', async () => {
  const hub = await startHub();
  try {
    const s = connect(hub.port, signFor('cashier', { expiresIn: '-1s' }));
    const msg = await waitConnectError(s);
    assert.equal(msg, 'unauthorized');
    s.close();
  } finally {
    await stopAll([], hub);
  }
});

test('a cashier cannot join kitchen or manager and receives no kitchen events', async () => {
  const hub = await startHub();
  const cashier = connect(hub.port, signFor('cashier'));
  try {
    await waitConnected(cashier);
    const newOrder = track(cashier, 'new_order');
    const managerOrder = track(cashier, 'order:new');
    const kitchenAlert = track(cashier, 'kitchen_alert');

    cashier.emit('join', { room: 'kitchen' });
    cashier.emit('join', { room: 'manager' });
    await pause(150);

    socketHub.emitNewOrder(fakeOrder());
    socketHub.emitKitchenAlert({ alertId: 7, orderId: 4242, orderNumber: 'ORD-4242', deviceId: 1, locationLabel: 'Counter' });
    await pause(400);

    assert.equal(newOrder.received, false, 'cashier must not receive kitchen new_order');
    assert.equal(managerOrder.received, false, 'cashier must not receive manager order:new');
    assert.equal(kitchenAlert.received, false, 'cashier must not receive kitchen alerts');
  } finally {
    await stopAll([cashier], hub);
  }
});

test('kitchen_staff auto-joins kitchen and receives new_order', async () => {
  const hub = await startHub();
  const kitchen = connect(hub.port, signFor('kitchen_staff'));
  try {
    await waitConnected(kitchen);
    const got = waitEvent(kitchen, 'new_order');
    socketHub.emitNewOrder(fakeOrder());
    const payload = await got;
    assert.equal(payload.order_number, 'ORD-4242');
    // Kitchen must NOT also receive the manager-channel duplicate shape.
    const managerTrickle = track(kitchen, 'order:new');
    await pause(300);
    assert.equal(managerTrickle.received, false, 'kitchen_staff must not receive manager events');
  } finally {
    await stopAll([kitchen], hub);
  }
});

test('manager is auto-joined to the manager room', async () => {
  const hub = await startHub();
  const manager = connect(hub.port, signFor('manager'));
  try {
    await waitConnected(manager);
    const got = waitEvent(manager, 'order:new');
    socketHub.emitNewOrder(fakeOrder());
    const payload = await got;
    assert.equal(payload.order_number, 'ORD-4242');
    assert.ok(Array.isArray(payload.order_items), 'manager payload carries order_items');
  } finally {
    await stopAll([manager], hub);
  }
});

test('esp32:register no longer claims the per-device room', async () => {
  const hub = await startHub();
  const cashier = connect(hub.port, signFor('cashier'));
  try {
    await waitConnected(cashier);
    const alerts = track(cashier, 'kitchen_alert');
    cashier.emit('esp32:register', { device_id: 99 });
    await pause(150);
    socketHub.emitKitchenAlert({ alertId: 8, orderId: 4242, orderNumber: 'ORD-4242', deviceId: 99, locationLabel: 'Counter' });
    await pause(400);
    assert.equal(alerts.received, false, 'esp32:register must not grant the esp32:<id> room');
  } finally {
    await stopAll([cashier], hub);
  }
});
