const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./orders.controller');

// Cashier + higher roles can create counter orders
const canOrder = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin', 'manager')];

// Kitchen staff + higher roles can update status
const canUpdateStatus = [authenticateToken, requireStaff, requireRoles('kitchen_staff', 'cashier', 'staff', 'owner', 'admin', 'manager')];

// POST /api/orders — create a counter order
router.post('/', ...canOrder, ctrl.createOrder);

// GET /api/orders — list orders (cashier sees own, others see all)
// The kitchen UI never reads these: it uses /api/kitchen/orders. Keeping its
// role out stops a kitchen account from scraping the order table.
const canReadOrders = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin', 'manager')];
router.get('/', ...canReadOrders, ctrl.getOrders);

// GET /api/orders/totals — all-time revenue collected + count, one row.
// Must be registered before '/:id' or Express matches "totals" as an id.
// Revenue stays with the manager and the cashier that earned it, not the
// kitchen. The cashier's own view is scoped server-side to their orders.
const canReadRevenue = [authenticateToken, requireStaff, requireRoles('cashier', 'owner', 'admin', 'manager')];
router.get('/totals', ...canReadRevenue, ctrl.getOrderTotals);

// GET /api/orders/report — sales report aggregates, one row.
router.get('/report', ...canReadRevenue, ctrl.getOrderReport);

// GET /api/orders/:id — get single order detail
router.get('/:id', ...canReadOrders, ctrl.getOrderById);

// PATCH /api/orders/:id/status — update order status (kitchen, staff, owner)
router.patch('/:id/status', ...canUpdateStatus, ctrl.updateOrderStatus);

// POST /api/orders/:id/cancel — cancel an order
// kitchen_staff is deliberately excluded: cancelling is a money-side decision.
const canCancel = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin', 'manager')];
router.post('/:id/cancel', ...canCancel, ctrl.cancelOrder);

// PATCH /api/orders/:id/items — replace order items (cashier edited draft after confirm)
router.patch('/:id/items', ...canOrder, ctrl.updateOrderItems);

module.exports = router;