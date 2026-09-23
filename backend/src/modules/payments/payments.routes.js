const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./payments.controller');

const cashierAccess = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin')];

// POST /api/payments — process payment for a counter order
router.post('/', ...cashierAccess, ctrl.processPayment);

// GET /api/payments/:orderId — get payment info for an order
router.get('/:orderId', authenticateToken, requireStaff, ctrl.getPaymentByOrder);

module.exports = router;