const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./orders.controller');

// All order routes require staff authentication
const staffAuth = [authenticateToken, requireStaff];

// Cashier + higher roles can create counter orders
const canOrder = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin')];

// Kitchen staff + higher roles can update status
const canUpdateStatus = [authenticateToken, requireStaff, requireRoles('kitchen_staff', 'cashier', 'staff', 'owner', 'admin')];

// POST /api/orders — create a counter order
router.post('/', ...canOrder, ctrl.createOrder);

// GET /api/orders — list orders (cashier sees own, others see all)
router.get('/', ...staffAuth, ctrl.getOrders);

// GET /api/orders/:id — get single order detail
router.get('/:id', ...staffAuth, ctrl.getOrderById);

// PATCH /api/orders/:id/status — update order status (kitchen, staff, owner)
router.patch('/:id/status', ...canUpdateStatus, ctrl.updateOrderStatus);

// POST /api/orders/:id/cancel — cancel an order
router.post('/:id/cancel', ...staffAuth, ctrl.cancelOrder);

module.exports = router;