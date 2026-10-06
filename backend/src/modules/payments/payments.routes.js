const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./payments.controller');

const cashierAccess = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin')];

// Roles allowed to check out, matching canOrder in orders.routes.js — a manager
// taking a supervisor override at the till can quote and pay, but the old
// payment path never allowed it.
const canCheckout = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin', 'manager')];

// POST /api/checkout — quote + payment in one transaction (two-phase counter flow)
router.post('/checkout', ...canCheckout, ctrl.checkout);

// POST /api/payments — process payment for a counter order
router.post('/', ...cashierAccess, ctrl.processPayment);

// GET /api/payments/:orderId — get payment info for an order
router.get('/:orderId', authenticateToken, requireStaff, ctrl.getPaymentByOrder);

module.exports = router;