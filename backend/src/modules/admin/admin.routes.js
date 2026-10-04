const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.controller');

// All admin routes require a valid JWT AND the 'admin' role
router.use(authenticateToken, requireRoles('admin'));

// ─── Staff Account Management ─────────────────────────────────────────────────
router.get   ('/',                    ctrl.listStaffAccounts);     // GET  /api/admin/staff-accounts
router.get   ('/:id',                 ctrl.getStaffAccount);       // GET  /api/admin/staff-accounts/:id
router.post  ('/',                    ctrl.createStaffAccount);    // POST /api/admin/staff-accounts
router.patch ('/:id/status',          ctrl.updateStaffStatus);     // PATCH /api/admin/staff-accounts/:id/status
router.post  ('/:id/reset-password',  ctrl.resetStaffPassword);   // POST /api/admin/staff-accounts/:id/reset-password

// ─── Dashboard Access per Staff ───────────────────────────────────────────────
router.get   ('/:id/dashboard-access', ctrl.getDashboardAccess);  // GET  /api/admin/staff-accounts/:id/dashboard-access
router.put   ('/:id/dashboard-access', ctrl.setDashboardAccess);  // PUT  /api/admin/staff-accounts/:id/dashboard-access

// ─── Switch PIN (admin-managed) ───────────────────────────────────────────────
router.post  ('/:id/switch-pin',      ctrl.adminSetSwitchPin);    // POST   /api/admin/staff-accounts/:id/switch-pin
router.delete('/:id/switch-pin',      ctrl.adminRemoveSwitchPin); // DELETE /api/admin/staff-accounts/:id/switch-pin

module.exports = router;