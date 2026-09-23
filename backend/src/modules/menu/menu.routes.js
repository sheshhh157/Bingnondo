const express = require('express');
const router  = express.Router();
const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./menu.controller');

// Reusable guard: authenticated staff with write access (staff / owner / admin)
const staffWrite = [authenticateToken, requireStaff, requireRoles('staff', 'owner', 'admin')];

// ─── Public ───────────────────────────────────────────────────────────────────
// GET /api/menu  — customers + cashier read-only
router.get('/', ctrl.getPublicMenu);

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