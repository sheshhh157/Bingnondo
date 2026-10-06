const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./payments.controller');

// ── Shared middleware sets ────────────────────────────────────────────────────
const cashierAccess = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin')];
const staffAccess   = [authenticateToken, requireStaff, requireRoles('staff', 'owner', 'admin')];

// ─────────────────────────────────────────────────────────────────────────────
// Counter / POS payments
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments — process payment for a counter order
router.post('/', ...cashierAccess, ctrl.processPayment);

// ─────────────────────────────────────────────────────────────────────────────
// §4.0 — GCash Receipt Verification Queue (Staff)
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/payments/pending          — list awaiting_verification + rejected
router.get('/pending', ...staffAccess, ctrl.getPendingPayments);

// POST /api/payments/:orderId/verify  — approve receipt → confirmed → kitchen
router.post('/:orderId/verify', ...staffAccess, ctrl.verifyPayment);

// POST /api/payments/:orderId/reject  — reject receipt → customer re-uploads
router.post('/:orderId/reject', ...staffAccess, ctrl.rejectPayment);

// ─────────────────────────────────────────────────────────────────────────────
// Generic lookup (must come after named sub-paths to avoid :orderId='pending')
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/payments/:orderId         — get payment info for a specific order
router.get('/:orderId', authenticateToken, requireStaff, ctrl.getPaymentByOrder);

module.exports = router;