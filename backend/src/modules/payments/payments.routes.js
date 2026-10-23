const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff, requireCustomer } = require('../../middleware/auth.middleware');
const ctrl = require('./payments.controller');
const receiptCtrl = require('./receipt.controller');
const { receiptUpload, handleReceiptUploadError } = require('../../config/receiptUpload');

// ── Shared middleware sets ────────────────────────────────────────────────────
const cashierAccess = [authenticateToken, requireStaff, requireRoles('cashier', 'admin')];
// cashier + admin can access payment verification
const staffAccess   = [authenticateToken, requireStaff, requireRoles('cashier', 'admin')];

// ─────────────────────────────────────────────────────────────────────────────
// Customer receipt upload
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments/extract-receipt
// Multipart form: field 'receipt' (image). Returns the uploaded image URL plus
// whatever could be read off the receipt (the app falls back to manual entry
// when nothing could be extracted).
router.post(
  '/extract-receipt',
  authenticateToken,
  requireCustomer,
  receiptUpload.single('receipt'),
  handleReceiptUploadError,
  receiptCtrl.extractReceipt
);

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