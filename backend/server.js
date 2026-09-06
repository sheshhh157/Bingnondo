const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

app.use(cors());
app.use(express.json());

// ─── Health / test ─────────────────────────────────────────────────────────
app.get('/api/test', (_req, res) => {
  res.json({ message: 'Manager backend is running (with live socket).' });
});

// ─── Read-only Manager endpoints ───────────────────────────────────────────
app.get('/api/manager/orders', (_req, res) => {
  res.json({ data: db.getOrders() });
});

app.get('/api/manager/orders/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  res.json({ data: order });
});

app.get('/api/manager/inventory', (_req, res) => {
  res.json({ data: { items: db.getInventory() } });
});

app.get('/api/manager/kitchen', (_req, res) => {
  res.json({ data: db.getKitchenOrders() });
});

app.get('/api/manager/kitchen/alerts', (_req, res) => {
  res.json({ data: db.getKitchenAlerts() });
});

app.get('/api/manager/deliveries', (_req, res) => {
  res.json({ data: db.getManagerDeliveries() });
});

// ─── Shared write-capable endpoints (cashier / kitchen / staff) ─────────────
function emitEvents(events) {
  if (!events) return;
  const list = Array.isArray(events) ? events : [events];
  for (const e of list) {
    if (!e?.type) continue;
    io.emit(e.type, e.payload);
    console.log(`[socket] Emitted: ${e.type}`);
  }
}

// Menu
app.get('/api/menu', (_req, res) => {
  res.json({ data: db.getMenu() });
});

// Orders
app.get('/api/orders', (_req, res) => {
  res.json({ data: db.getOrders() });
});

app.get('/api/orders/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  res.json({ data: order });
});

app.post('/api/orders', (req, res) => {
  const { error, order, events } = db.createOrder(req.body);
  if (error || !order) return res.status(400).json({ message: error || 'Could not create order.' });
  emitEvents(events);
  res.status(201).json({ data: order });
});

app.post('/api/orders/:id/payment', (req, res) => {
  const result = db.processPayment(req.params.id, req.body);
  if (!result) return res.status(404).json({ message: 'Order not found.' });
  emitEvents(result.events);
  res.json({ data: { success: true, message: 'Payment processed.' } });
});

// Kitchen
app.get('/api/kitchen', (_req, res) => {
  res.json({ data: db.getKitchenOrders() });
});

app.get('/api/kitchen/alerts', (_req, res) => {
  res.json({ data: db.getKitchenAlerts() });
});

app.patch('/api/kitchen/orders/:id/status', (req, res) => {
  const { error, events } = db.setKitchenStatus(req.params.id, req.body.status);
  if (error) return res.status(400).json({ message: error });
  emitEvents(events);
  res.json({ data: { success: true } });
});

// Inventory
app.get('/api/inventory', (_req, res) => {
  res.json({ data: { items: db.getInventory() } });
});

app.patch('/api/inventory/:id', (req, res) => {
  const result = db.updateInventory(req.params.id, req.body);
  if (!result) return res.status(404).json({ message: 'Inventory item not found.' });
  emitEvents(result.events);
  res.status(200).json({ data: { success: true } });
});

// Deliveries
app.get('/api/deliveries', (_req, res) => {
  res.json({ data: { deliveries: db.getDeliveries() } });
});

app.post('/api/deliveries/:id/assign', (req, res) => {
  const { error, delivery, events } = db.assignDelivery(req.params.id, req.body);
  if (error || !delivery) return res.status(400).json({ message: error || 'Assignment failed.' });
  emitEvents(events);
  res.json({ data: delivery });
});

app.patch('/api/deliveries/:id/status', (req, res) => {
  const { error, delivery, events } = db.updateDeliveryStatus(req.params.id, req.body.status);
  if (error || !delivery) return res.status(400).json({ message: error || 'Update failed.' });
  emitEvents(events);
  res.json({ data: delivery });
});

// Menu mutations
app.post('/api/menu/items', (req, res) => {
  const { error, item, events } = db.createMenuItem(req.body);
  if (error || !item) return res.status(400).json({ message: error || 'Failed to add item.' });
  emitEvents(events);
  res.status(201).json({ data: item });
});

app.patch('/api/menu/items/:id', (req, res) => {
  const { error, item, events } = db.updateMenuItem(req.params.id, req.body);
  if (error || !item) return res.status(400).json({ message: error || 'Update failed.' });
  emitEvents(events);
  res.json({ data: item });
});

app.patch('/api/menu/items/:id/availability', (req, res) => {
  const { error, item, events } = db.setMenuItemAvailability(req.params.id, req.body.is_available);
  if (error || !item) return res.status(400).json({ message: error || 'Update failed.' });
  emitEvents(events);
  res.json({ data: { id: item.id, is_available: item.is_available } });
});

app.delete('/api/menu/items/:id', (req, res) => {
  const { error, item, events } = db.removeMenuItem(req.params.id);
  if (error || !item) return res.status(400).json({ message: error || 'Remove failed.' });
  emitEvents(events);
  res.json({ data: { success: true } });
});

// Kitchen alerts
app.patch('/api/kitchen/alerts/:id/acknowledge', (req, res) => {
  const { error } = db.acknowledgeAlert(req.params.id);
  if (error) return res.status(400).json({ message: error });
  res.json({ data: { success: true } });
});

// Admin — staff accounts
app.get('/api/accounts', (req, res) => {
  res.json({ data: db.listStaffAccounts(req.query) });
});

app.post('/api/accounts', (req, res) => {
  if (!req.body?.full_name || !req.body?.email) return res.status(400).json({ message: 'Name and email are required.' });
  res.status(201).json({ data: db.createStaffAccount(req.body) });
});

app.patch('/api/accounts/:id/status', (req, res) => {
  const { error } = db.updateStaffStatus(req.params.id, req.body.status);
  if (error) return res.status(400).json({ message: error });
  res.json({ data: { success: true } });
});

app.post('/api/accounts/:id/reset-password', (req, res) => {
  const { error } = db.resetStaffPassword(req.params.id);
  if (error) return res.status(400).json({ message: error });
  res.json({ data: { success: true } });
});

// Admin — settings
app.get('/api/settings', (_req, res) => {
  res.json({ data: db.getSettings() });
});

app.patch('/api/settings', (req, res) => {
  db.updateSettings(req.body);
  res.json({ data: { success: true } });
});

// Admin — ESP32 devices
app.get('/api/devices', (_req, res) => {
  res.json({ data: db.listDevices() });
});

app.post('/api/devices', (req, res) => {
  if (!req.body?.device_code) return res.status(400).json({ message: 'Device code is required.' });
  res.status(201).json({ data: db.registerDevice(req.body) });
});

app.delete('/api/devices/:id', (req, res) => {
  const { error } = db.removeDevice(req.params.id);
  if (error) return res.status(400).json({ message: error });
  res.json({ data: { success: true } });
});

// Admin — audit log
app.get('/api/audit-log', (req, res) => {
  res.json({ data: db.getAuditLog(req.query) });
});

// Admin — customer restrictions
app.get('/api/customer-restrictions', (req, res) => {
  res.json({ data: db.listCustomerRestrictions(req.query) });
});

app.get('/api/customer-restrictions/:id/violations', (req, res) => {
  res.json({ data: db.getCustomerViolations(req.params.id) });
});

app.patch('/api/customer-restrictions/:id/override', (req, res) => {
  const { error } = db.overrideCustomerRestriction(req.params.id, req.body);
  if (error) return res.status(400).json({ message: error });
  res.json({ data: { success: true } });
});

// Support chat
app.get('/api/support-chat/threads', (_req, res) => {
  res.json({ data: { threads: db.getChatThreads() } });
});

app.get('/api/support-chat/:chatId/messages', (req, res) => {
  res.json({ data: { messages: db.getChatMessages(req.params.chatId) } });
});

app.post('/api/support-chat/message', (req, res) => {
  const { error, message, events } = db.sendChatMessage(req.body);
  if (error || !message) return res.status(400).json({ message: error || 'Send failed.' });
  emitEvents(events);
  res.status(201).json({ data: { message } });
});

// ─── 404 for unknown routes ────────────────────────────────────────────────
// NOTE: never answer /socket.io here. Engine.io (Socket.io) is attached to
// the same HTTP server with its own listener, which runs after Express.
// Ending the response here would 404 the polling transport handshake.
app.use((req, res) => {
  if (req.url.startsWith('/socket.io')) return; // let engine.io answer
  res.status(404).json({ message: 'Endpoint not found.' });
});

// ─── Socket.io ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[socket] Client connected: ${socket.id} (total: ${io.engine.clientsCount})`);

  socket.on('disconnect', () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
  });
});

// ─── Simulated live events ──────────────────────────────────────────────────
// Fires random events every 8-15s so the manager dashboard feels alive
function runSimulatedEvent() {
  const events = [
    () => db.advanceKitchenOrder(),
    () => db.addNewKitchenOrder(),
    () => db.adjustInventory(),
    () => db.advanceDelivery(),
    () => db.maybeAddDelivery(),
  ];

  const event = events[Math.floor(Math.random() * events.length)];
  const result = event();

  emitEvents(result?.events);

  const nextDelay = 8000 + Math.floor(Math.random() * 7000);
  setTimeout(runSimulatedEvent, nextDelay);
}

// Start simulation after a short delay (disable with DISABLE_SIM=1)
if (process.env.DISABLE_SIM !== '1') {
  setTimeout(runSimulatedEvent, 5000);
}

// ─── Start server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Manager backend running on http://localhost:${PORT}`);
  console.log(`Socket.io ready — simulating live events every 8-15s`);
});
