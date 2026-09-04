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

app.get('/api/manager/health', (_req, res) => {
  res.json({ socketConnected: io.engine.clientsCount > 0, connectedClients: io.engine.clientsCount, uptime: process.uptime() });
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
  res.json({ data: db.getDeliveries() });
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

  if (result) {
    io.emit(result.type, result.payload);
    console.log(`[socket] Emitted: ${result.type}`);
  }

  const nextDelay = 8000 + Math.floor(Math.random() * 7000);
  setTimeout(runSimulatedEvent, nextDelay);
}

// Start simulation after a short delay
setTimeout(runSimulatedEvent, 5000);

// ─── Start server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Manager backend running on http://localhost:${PORT}`);
  console.log(`Socket.io ready — simulating live events every 8-15s`);
});
