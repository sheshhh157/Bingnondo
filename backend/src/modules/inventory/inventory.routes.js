const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const { writeLimiter } = require('../../middleware/rate-limit.middleware');
const ctrl = require('./inventory.controller');

// All inventory routes are staff-only
const staffAccess = [authenticateToken, requireStaff];
const staffWrite  = [authenticateToken, requireStaff, requireRoles('staff', 'owner', 'admin'), writeLimiter];

// DELETE /api/inventory/:id                — remove an ingredient outright.
// Cascades menu_item_ingredients (recipe links) and inventory_transactions
// (movement history). The response names every menu item that gets unlinked so
// the caller can warn before the history is gone.
router.delete('/:id', ...staffWrite, ctrl.deleteItem);

// POST /api/inventory/:id/out-of-stock  — force to 0 + cascade menu unavailability
router.post('/:id/out-of-stock', ...staffWrite, ctrl.outOfStock);

// GET  /api/inventory                     — list all items + low-stock flag
router.get('/', ...staffAccess, ctrl.getAll);

// POST /api/inventory                     — create a new ingredient
router.post('/', ...staffWrite, ctrl.createItem);

// GET  /api/inventory/:id                 — single item detail
router.get('/:id', ...staffAccess, ctrl.getById);

// PATCH /api/inventory/:id                — edit name / category.
// Cannot move stock: that only happens through a logged transaction.
router.patch('/:id', ...staffWrite, ctrl.updateItem);

// POST /api/inventory/:id/transaction     — restock / adjustment / deduction
router.post('/:id/transaction', ...staffWrite, ctrl.createTransaction);

// GET  /api/inventory/:id/transactions    — movement history
router.get('/:id/transactions', ...staffAccess, ctrl.getTransactions);

module.exports = router;