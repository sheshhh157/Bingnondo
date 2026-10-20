require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { Server } = require('socket.io');

// ── Middleware ─────────────────────────────────────────────────────────────────
const { generalApiLimiter, loginLimiter, otpLimiter, resetLimiter } = require('./src/middleware/rate-limit.middleware');

// ── Routes ─────────────────────────────────────────────────────────────────────
const authRoutes        = require('./src/modules/auth/auth.routes');
const menuRoutes        = require('./src/modules/menu/menu.routes');
const inventoryRoutes   = require('./src/modules/inventory/inventory.routes');
const ordersRoutes      = require('./src/modules/orders/orders.routes');
const paymentsRoutes    = require('./src/modules/payments/payments.routes');
const kitchenRoutes     = require('./src/modules/kitchen/kitchen.routes');
// Admin + Staff routes
const adminStaffRoutes    = require('./src/modules/admin/admin.routes');

const adminSettingsRoutes = require('./src/modules/admin/admin.settings.routes');
const adminRiderRoutes    = require('./src/modules/admin/admin.riders.routes');
const adminDeliveryRoutes = require('./src/modules/admin/admin.deliveries.routes');
const adminAuditRoutes    = require('./src/modules/admin/admin.audit.routes');
const adminNotificationsRoutes = require('./src/modules/admin/admin.notifications.routes'); // Notification bell feed
const adminCustomerRestrictionsRoutes = require('./src/modules/admin/customer-restrictions.routes'); // §6.4
const supportChatRoutes   = require('./src/modules/support-chat/support-chat.routes');
const uploadRoutes        = require('./src/modules/upload/upload.routes');

const riderRoutes         = require('./src/modules/rider/rider.routes');      // rider-scoped (/api/rider/*)
// ── Controllers that need the io instance ──────────────────────────────────────
const menuCtrl   = require('./src/modules/menu/menu.controller');
const socketHub  = require('./src/sockets');

// Idempotent schema top-ups (address pin columns) — shared DB with the app backend
const ensureSchema = require('./src/config/ensureSchema');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Share io with controllers that emit real-time events
menuCtrl.setIO(io);
socketHub.setIO(io);

// ─── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());
app.use('/api', generalApiLimiter);

// ─── Auth Routes (with tighter rate limits on sensitive endpoints) ─────────────
app.use('/api/auth/login',           loginLimiter);   // shared login (staff + rider)
app.use('/api/auth/staff/login',     loginLimiter);   // legacy staff-only route
app.use('/api/auth/forgot-password', otpLimiter);
app.use('/api/auth/reset-password',  resetLimiter);
app.use('/api/auth', authRoutes);

// ─── Menu & Inventory Routes ───────────────────────────────────────────────────
app.use('/api/menu',      menuRoutes);
app.use('/api/upload',    uploadRoutes);
app.use('/api/inventory', inventoryRoutes);

// ─── Orders & Payments Routes ──────────────────────────────────────────────────
app.use('/api/orders',   ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/kitchen',  kitchenRoutes);
app.use('/api/esp32',    require('./src/modules/kitchen/esp32.routes'));   // ESP32 buzzer device

// ─── Rider Routes ─────────────────────────────────────────────────────────────
// Requires JWT type='rider' — enforced by requireRider middleware inside the router
// 7.2: GET  /api/rider/delivery/current
//      PATCH /api/rider/delivery/:id/status
// 7.3: GET  /api/rider/deliveries
//      GET  /api/rider/profile
//      PATCH /api/rider/profile
app.use('/api/rider', riderRoutes);

// ─── Admin Routes ──────────────────────────────────────────────────────────────
// Staff account management
app.use('/api/admin/staff-accounts', adminStaffRoutes);


// System settings: business hours, menu categories
app.use('/api/admin/system-settings', adminSettingsRoutes);
app.use('/api/admin/riders',          adminRiderRoutes);   // §6.5 Rider CRUD (admin)
app.use('/api/admin/deliveries',      adminDeliveryRoutes); // Riders & Deliveries — read-only list
app.use('/api/admin/audit-log',       adminAuditRoutes);  // §6.6 Admin audit trail
app.use('/api/admin/notifications',   adminNotificationsRoutes); // Bell feed + seen marker
// Customer Restrictions (§6.4) — Admin only
app.use('/api/admin/customer-restrictions', adminCustomerRestrictionsRoutes);
app.use('/api/support-chat',          supportChatRoutes);
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
  console.log(`Auth:         POST /api/auth/login  (shared staff + rider)`);
  console.log(`              POST /api/auth/staff/login  (legacy)`);
  console.log(`Menu:         GET /api/menu  |  GET /api/menu/staff  |  POST/PUT/DELETE /api/menu/:id`);
  console.log(`Inventory:    GET /api/inventory  |  POST /api/inventory/:id/transaction`);
  console.log(`Orders:       POST /api/orders  |  GET /api/orders  |  PATCH /api/orders/:id/status`);
  console.log(`Payments:     POST /api/payments  |  GET /api/payments/:orderId`);
  console.log(`Kitchen:      GET /api/kitchen/orders  |  PATCH /api/kitchen/orders/:id/status`);
  console.log(`Admin:        GET/POST /api/admin/staff-accounts`);
  console.log(`Rider:        GET  /api/rider/delivery/current`);
  console.log(`              PATCH /api/rider/delivery/:id/status`);
  console.log(`              GET  /api/rider/deliveries`);
  console.log(`              GET/PATCH /api/rider/profile`);
  console.log(`Riders (admin): GET/POST             /api/admin/riders`);
  console.log(`                GET/PUT              /api/admin/riders/:id`);
  console.log(`                PATCH                /api/admin/riders/:id/status`);
  console.log(`                POST                 /api/admin/riders/:id/reset-password`);
  console.log(`Restrictions: GET                  /api/admin/customer-restrictions`);
  console.log(`              GET                  /api/admin/customer-restrictions/:id/violations`);
  console.log(`              PATCH                /api/admin/customer-restrictions/:id`);
  console.log(`              PATCH                /api/admin/customer-restrictions/:id/account-status`);
  console.log(`Settings:     GET/PUT              /api/admin/system-settings/business-hours`);
  console.log(`              GET/POST/PATCH/DELETE /api/admin/system-settings/menu-categories`);
});

// Idempotent schema top-ups (address pin columns). Non-fatal if it fails.
ensureSchema().catch((err) =>
  console.error('[schema] ensureSchema failed:', err.message)
);