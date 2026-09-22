require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { Server } = require('socket.io');

// ── Middleware ─────────────────────────────────────────────────────────────────
const { generalApiLimiter, loginLimiter, otpLimiter } = require('./src/middleware/rate-limit.middleware');

// ── Routes ─────────────────────────────────────────────────────────────────────
const authRoutes      = require('./src/modules/auth/auth.routes');
const menuRoutes      = require('./src/modules/menu/menu.routes');
const inventoryRoutes = require('./src/modules/inventory/inventory.routes');

// ── Controllers that need the io instance ──────────────────────────────────────
const menuCtrl = require('./src/modules/menu/menu.controller');

// ── Legacy mock data (Manager dashboard — keep until full backend is ready) ────
const db = require('./data');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Share io with controllers that emit real-time events
menuCtrl.setIO(io);

// ─── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use('/api', generalApiLimiter);

// ─── Auth Routes (with tighter rate limits on sensitive endpoints) ─────────────
app.use('/api/auth/staff/login',     loginLimiter);
app.use('/api/auth/forgot-password', otpLimiter);
app.use('/api/auth', authRoutes);

// ─── Menu & Inventory Routes ───────────────────────────────────────────────────
app.use('/api/menu',      menuRoutes);
app.use('/api/inventory', inventoryRoutes);

// ─── Health / test ─────────────────────────────────────────────────────────────
app.get('/api/test', (_req, res) => {
  res.json({ message: 'Bingnondo backend is running.' });
});

app.get('/api/manager/health', (_req, res) => {
  res.json({
    socketConnected: io.engine.clientsCount > 0,
    connectedClients: io.engine.clientsCount,
    uptime: process.uptime(),
  });
});

// ─── Manager Read-only Endpoints (mock — replace per module) ───────────────────
app.get('/api/manager/orders',         (_req, res) => res.json({ data: db.getOrders() }));
app.get('/api/manager/orders/:id',      (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  res.json({ data: order });
});
app.get('/api/manager/inventory',      (_req, res) => res.json({ data: { items: db.getInventory() } }));
app.get('/api/manager/kitchen',        (_req, res) => res.json({ data: db.getKitchenOrders() }));
app.get('/api/manager/kitchen/alerts', (_req, res) => res.json({ data: db.getKitchenAlerts() }));
app.get('/api/manager/deliveries',     (_req, res) => res.json({ data: db.getDeliveries() }));

// ─── 404 for unknown routes ────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.url.startsWith('/socket.io')) return;
  res.status(404).json({ message: 'Endpoint not found.' });
});

// ─── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(err.status || 500).json({ message: err.message || 'Something went wrong. Please try again.' });
});

// ─── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[socket] Client connected: ${socket.id} (total: ${io.engine.clientsCount})`);
  socket.on('disconnect', () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
  });
});

// ─── Simulated live events (Manager dashboard) ─────────────────────────────────
function runSimulatedEvent() {
  const events = [
    () => db.advanceKitchenOrder(),
    () => db.addNewKitchenOrder(),
    () => db.adjustInventory(),
    () => db.advanceDelivery(),
    () => db.maybeAddDelivery(),
  ];
  const result = events[Math.floor(Math.random() * events.length)]();
  if (result) {
    io.emit(result.type, result.payload);
    console.log(`[socket] Emitted: ${result.type}`);
  }
  setTimeout(runSimulatedEvent, 8000 + Math.floor(Math.random() * 7000));
}
setTimeout(runSimulatedEvent, 5000);

// ─── Start Server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Bingnondo backend running on http://localhost:${PORT}`);
  console.log(`Auth:      POST /api/auth/staff/login`);
  console.log(`Menu:      GET /api/menu  |  GET /api/menu/staff  |  POST/PUT/DELETE /api/menu/:id`);
  console.log(`Inventory: GET /api/inventory  |  POST /api/inventory/:id/transaction`);
});