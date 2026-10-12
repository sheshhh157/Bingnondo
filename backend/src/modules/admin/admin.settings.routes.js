const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.settings.controller');

// All system-settings routes are admin-only
router.use(authenticateToken, requireRoles('admin'));

// ─── Business Hours ───────────────────────────────────────────────────────────
router.get('/business-hours',        ctrl.getBusinessHours);  // GET /api/admin/system-settings/business-hours
router.put('/business-hours',        ctrl.saveBusinessHours); // PUT /api/admin/system-settings/business-hours

// ─── Menu Categories ──────────────────────────────────────────────────────────
router.get   ('/menu-categories',     ctrl.listCategories);  // GET    /api/admin/system-settings/menu-categories
router.post  ('/menu-categories',     ctrl.createCategory);  // POST   /api/admin/system-settings/menu-categories
router.patch ('/menu-categories/:id', ctrl.updateCategory);  // PATCH  /api/admin/system-settings/menu-categories/:id
router.delete('/menu-categories/:id', ctrl.deleteCategory);  // DELETE /api/admin/system-settings/menu-categories/:id

module.exports = router;