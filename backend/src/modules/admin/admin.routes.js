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
router.put   ('/:id',                 ctrl.updateStaffAccount);    // PUT   /api/admin/staff-accounts/:id
router.delete('/:id',                 ctrl.deleteStaffAccount);    // DELETE /api/admin/staff-accounts/:id
router.post  ('/:id/reset-password',  ctrl.resetStaffPassword);   // POST /api/admin/staff-accounts/:id/reset-password



module.exports = router;