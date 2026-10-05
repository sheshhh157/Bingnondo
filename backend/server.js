require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { Server } = require('socket.io');

// ── Middleware ─────────────────────────────────────────────────────────────────
const { generalApiLimiter, loginLimiter, otpLimiter } = require('./src/middleware/rate-limit.middleware');

// ── Routes ─────────────────────────────────────────────────────────────────────
const authRoutes        = require('./src/modules/auth/auth.routes');
const menuRoutes        = require('./src/modules/menu/menu.routes');
const inventoryRoutes   = require('./src/modules/inventory/inventory.routes');
const ordersRoutes      = require('./src/modules/orders/orders.routes');
const paymentsRoutes    = require('./src/modules/payments/payments.routes');
const kitchenRoutes     = require('./src/modules/kitchen/kitchen.routes');
// NEW ▼
const adminStaffRoutes    = require('./src/modules/admin/admin.routes');
const adminConfigRoutes   = require('./src/modules/admin/admin.switch-config.routes');
const adminSettingsRoutes = require('./src/modules/admin/admin.settings.routes');
// Auth middleware + shared admin controller (used for the audit-log route,
// which lives on admin.controller but is not exposed by any of the admin routers)
const adminCtrl          = require('./src/modules/admin/admin.controller');
const { authenticateToken, requireRoles } = require('./src/middleware/auth.middleware');

// ── Controllers that need the io instance ──────────────────────────────────────
const menuCtrl   = require('./src/modules/menu/menu.controller');
const socketHub  = require('./src/sockets');

// ─── CORS origin list (shared by Express and Socket.IO) ─────────────────────
// FRONTEND_URL may hold several origins, comma-separated. Production refuses
// to start without it — silently allowing '*' would let any site open
// authenticated sockets. In development, fall back to the Vite dev server.
function parseAllowedOrigins() {
  const raw = process.env.FRONTEND_URL;
  if (raw && raw.trim()) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_URL is required in production (comma-separated origins).');
  }
  return ['http://localhost:5173'];
}
const allowedOrigins = parseAllowedOrigins();

if (process.env.NODE_ENV !== 'test') {
  require('./src/scheduler').startAutoCancelJob();
}
// A placeholder or weak device key turns /api/esp32/* into an open endpoint, so
// boot is only allowed when the key is strong. deviceAuth stays the second
// line of defence for requests; this stops a misconfigured .env from ever
// serving them.
(() => {
  const key = process.env.ESP32_DEVICE_KEY;
  const problems = [];
  if (!key) problems.push('it is missing (ESP32_DEVICE_KEY)');
  if (key && key.length < 24) problems.push('it is shorter than 24 characters');
  if (key === 'pick_any_long_random_string') problems.push('it is still the placeholder value');
  if (problems.length > 0) {
    throw new Error(
      `[config] ESP32_DEVICE_KEY is not acceptable: ${problems.join('; ')}. ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
})();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Share io with controllers that emit real-time events
menuCtrl.setIO(io);
socketHub.setIO(io);

// ─── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: allowedOrigins,
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

// ─── Orders & Payments Routes ──────────────────────────────────────────────────
app.use('/api/orders',   ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/kitchen',  kitchenRoutes);
app.use('/api/esp32',    require('./src/modules/kitchen/esp32.routes'));

// ─── Admin Routes (NEW) ────────────────────────────────────────────────────────
// Staff account management + dashboard access grants + PIN management
app.use('/api/admin/staff-accounts', adminStaffRoutes);
// Switch config (per-staff and per-dashboard PIN requirement toggles)
app.use('/api/admin/switch-config',  adminConfigRoutes);
// System settings: ESP32 devices, business hours, menu categories
app.use('/api/admin/system-settings', adminSettingsRoutes);
// Audit log is read-only/immutable — exposed at the admin root (not under staff-accounts)
app.get('/api/admin/audit-log', authenticateToken, requireRoles('admin'), adminCtrl.getAuditLog);

// PayMongo webhook — no auth middleware (signed by PayMongo header)
const paymentsCtrl = require('./src/modules/payments/payments.controller');
app.post('/api/webhooks/paymongo', paymentsCtrl.paymongoWebhook);

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