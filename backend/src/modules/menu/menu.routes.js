const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff, requireCustomer } = require('../../middleware/auth.middleware');
const ctrl = require('./menu.controller');
const reviewsCtrl = require('../reviews/reviews.controller');

// Reusable guard: authenticated staff with write access
// Menu management (items, ingredient links, categories, availability) lives on
// the admin side only — cashier/staff/owner are blocked from writes.
const staffWrite = [authenticateToken, requireStaff, requireRoles('admin')];

// ─── Public ───────────────────────────────────────────────────────────────────
// GET /api/menu  — customers + cashier read-only
router.get('/', ctrl.getPublicMenu);

// POST /api/menu/availability-check  — pre-checkout re-check of the cart.
// Body: { item_ids: [int, ...] }  → { items: [{ id, name, is_available }] }
router.post('/availability-check', ctrl.checkAvailability);

// ─── Staff read ───────────────────────────────────────────────────────────────
// GET /api/menu/staff  — enriched view with ingredients list
router.get('/staff', authenticateToken, requireStaff, ctrl.getStaffMenu);

// ─── Categories ───────────────────────────────────────────────────────────────
// GET  /api/menu/categories
router.get('/categories', authenticateToken, requireStaff, ctrl.getCategories);

// POST /api/menu/categories
router.post('/categories', ...staffWrite, ctrl.createCategory);

// DELETE /api/menu/categories/:id
router.delete('/categories/:id', ...staffWrite, ctrl.deleteCategory);

// ─── Menu item CRUD ───────────────────────────────────────────────────────────
// GET  /api/menu/items/:id/reviews  — public; customer app ratings section.
// POST /api/menu/items/:id/reviews  — customer; submit/update a rating.
// Registered before '/:id' so the literal 'items' segment isn't captured.
router.get('/items/:id/reviews', reviewsCtrl.getItemReviews);
router.post('/items/:id/reviews', authenticateToken, requireCustomer, reviewsCtrl.createItemReview);

// GET  /api/menu/:id
router.get('/:id', authenticateToken, requireStaff, ctrl.getMenuItemById);

// POST /api/menu
router.post('/', ...staffWrite, ctrl.createMenuItem);

// PUT  /api/menu/:id
router.put('/:id', ...staffWrite, ctrl.updateMenuItem);

// PATCH /api/menu/:id/availability  — manual override toggle
router.patch('/:id/availability', ...staffWrite, ctrl.setAvailability);

// DELETE /api/menu/:id
router.delete('/:id', ...staffWrite, ctrl.deleteMenuItem);

module.exports = router;