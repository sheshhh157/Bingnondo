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
router.put   ('/menu-categories/:id/variants', ctrl.updateCategoryVariants); // PUT /api/admin/system-settings/menu-categories/:id/variants

// ─── Menu Variants (reusable variant groups) ──────────────────────────────────
router.get   ('/variants',     ctrl.listVariantGroups);  // GET    /api/admin/system-settings/variants
router.post  ('/variants',     ctrl.createVariantGroup); // POST   /api/admin/system-settings/variants
router.patch ('/variants/:id', ctrl.updateVariantGroup); // PATCH  /api/admin/system-settings/variants/:id
router.delete('/variants/:id', ctrl.deleteVariantGroup); // DELETE /api/admin/system-settings/variants/:id

// ─── Notification Settings ────────────────────────────────────────────────────
router.get('/notifications', ctrl.getNotificationSettings);  // GET /api/admin/system-settings/notifications
router.put('/notifications', ctrl.saveNotificationSettings); // PUT /api/admin/system-settings/notifications

module.exports = router;