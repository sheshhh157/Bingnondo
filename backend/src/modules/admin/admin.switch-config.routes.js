const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.controller');

// All switch-config routes are admin-only
router.use(authenticateToken, requireRoles('admin'));

// GET  /api/admin/switch-config                              — list all config rows
router.get('/',                               ctrl.getSwitchConfig);

// PUT  /api/admin/switch-config/per-staff/:staffId          — toggle PIN for one staff member
router.put('/per-staff/:staffId',             ctrl.setPerStaffSwitchConfig);

// PUT  /api/admin/switch-config/per-dashboard/:dashboard    — toggle PIN for one dashboard target
router.put('/per-dashboard/:dashboard',       ctrl.setPerDashboardSwitchConfig);

module.exports = router;