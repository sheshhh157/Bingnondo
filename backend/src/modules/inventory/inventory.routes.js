const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./inventory.controller');

// All inventory routes are staff-only
const staffAccess = [authenticateToken, requireStaff];
const staffWrite  = [authenticateToken, requireStaff, requireRoles('staff', 'owner', 'admin')];

// GET  /api/inventory                     — list all items + low-stock flag
router.get('/', ...staffAccess, ctrl.getAll);

// POST /api/inventory                     — create a new ingredient
router.post('/', ...staffWrite, ctrl.createItem);

// GET  /api/inventory/:id                 — single item detail
router.get('/:id', ...staffAccess, ctrl.getById);

// POST /api/inventory/:id/transaction     — restock / adjustment / deduction
router.post('/:id/transaction', ...staffWrite, ctrl.createTransaction);

// GET  /api/inventory/:id/transactions    — movement history
router.get('/:id/transactions', ...staffAccess, ctrl.getTransactions);

module.exports = router;