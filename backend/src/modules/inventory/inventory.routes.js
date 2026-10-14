const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./inventory.controller');

// All inventory routes are staff-only
const staffAccess = [authenticateToken, requireStaff];
// 'cashier' added — cashier can now restock/adjust inventory via the Staff Portal tab
const staffWrite  = [authenticateToken, requireStaff, requireRoles('cashier', 'staff', 'owner', 'admin')];
// Creating new ingredients lives on the admin side only
const adminOnly   = [authenticateToken, requireStaff, requireRoles('admin')];

// POST /api/inventory/:id/out-of-stock  — force to 0 + cascade menu unavailability
router.post('/:id/out-of-stock', ...staffWrite, ctrl.outOfStock);

// GET  /api/inventory                     — list all items + low-stock flag
router.get('/', ...staffAccess, ctrl.getAll);

// POST /api/inventory                     — create a new ingredient (admin only)
router.post('/', ...adminOnly, ctrl.createItem);

// GET  /api/inventory/:id                 — single item detail
router.get('/:id', ...staffAccess, ctrl.getById);

// POST /api/inventory/:id/transaction     — restock / adjustment / deduction
router.post('/:id/transaction', ...staffWrite, ctrl.createTransaction);

// GET  /api/inventory/:id/transactions    — movement history
router.get('/:id/transactions', ...staffAccess, ctrl.getTransactions);

module.exports = router;