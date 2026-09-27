const express = require('express');
const router  = express.Router();
const { authenticateToken, requireStaff, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./kitchen.controller');

// All kitchen routes require staff auth
const staffAuth = [authenticateToken, requireStaff];

// kitchen_staff, staff, owner, admin can view and update kitchen orders/alerts
const kitchenRoles = [
  authenticateToken,
  requireStaff,
  requireRoles('kitchen_staff', 'staff', 'owner', 'admin'),
];

// GET  /api/kitchen/orders                      — kitchen display queue (pending + confirmed + preparing)
router.get('/orders', ...staffAuth, ctrl.getKitchenOrders);

// PATCH /api/kitchen/orders/:id/acknowledge     — pending → confirmed (kitchen receives the order)
router.patch('/orders/:id/acknowledge', ...kitchenRoles, ctrl.acknowledgeOrder);

// PATCH /api/kitchen/orders/:id/status          — confirmed → preparing → ready
router.patch('/orders/:id/status', ...kitchenRoles, ctrl.updateKitchenOrderStatus);

// GET  /api/kitchen/alerts                      — unacknowledged ESP32 alerts
router.get('/alerts', ...staffAuth, ctrl.getKitchenAlerts);

// POST /api/kitchen/alerts/:id/acknowledge      — acknowledge alert + stop buzzer
router.post('/alerts/:id/acknowledge', ...kitchenRoles, ctrl.acknowledgeAlert);

module.exports = router;