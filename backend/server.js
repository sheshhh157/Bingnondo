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
const ordersRoutes    = require('./src/modules/orders/orders.routes');
const paymentsRoutes  = require('./src/modules/payments/payments.routes');
const kitchenRoutes   = require('./src/modules/kitchen/kitchen.routes');

// ── Controllers that need the io instance ──────────────────────────────────────
const menuCtrl   = require('./src/modules/menu/menu.controller');
const socketHub  = require('./src/sockets');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Share io with controllers that emit real-time events
menuCtrl.setIO(io);
socketHub.setIO(io);   // NEW: socket hub for orders, kitchen alerts, etc.

// ─── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:5173'),
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

// ─── Orders & Payments Routes (NEW) ───────────────────────────────────────────
app.use('/api/orders',   ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/kitchen',  kitchenRoutes);
app.use('/api/esp32',    require('./src/modules/kitchen/esp32.routes'));

// ─── Health / test ─────────────────────────────────────────────────────────────
app.get('/api/test', (_req, res) => {
  res.json({ message: 'Bingnondo backend is running.' });
});

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

// ─── Start Server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\nBingnondo backend running on http://localhost:${PORT}`);
  console.log(`Auth:      POST /api/auth/staff/login`);
  console.log(`Menu:      GET /api/menu  |  GET /api/menu/staff  |  POST/PUT/DELETE /api/menu/:id`);
  console.log(`Inventory: GET /api/inventory  |  POST /api/inventory/:id/transaction`);
  console.log(`Orders:    POST /api/orders  |  GET /api/orders  |  PATCH /api/orders/:id/status`);
  console.log(`Payments:  POST /api/payments  |  GET /api/payments/:orderId`);
  console.log(`Kitchen:   GET /api/kitchen/orders  |  PATCH /api/kitchen/orders/:id/acknowledge  |  PATCH /api/kitchen/orders/:id/status  |  GET /api/kitchen/alerts  |  POST /api/kitchen/alerts/:id/acknowledge`);
  console.log(`ESP32:     GET /api/esp32/alert?device_code=...  (polls, and doubles as the heartbeat)`);
  //
});