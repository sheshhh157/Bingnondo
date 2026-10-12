const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.riders.controller');

// All rider-management routes are admin-only
router.use(authenticateToken, requireRoles('admin'));

// GET    /api/admin/riders          — list all riders (filterable by ?status=)
router.get('/',                   ctrl.listRiders);

// GET    /api/admin/riders/:id      — single rider detail
router.get('/:id',                ctrl.getRider);

// POST   /api/admin/riders          — create new rider account
router.post('/',                  ctrl.createRider);

// PUT    /api/admin/riders/:id      — update name, contact, vehicle info
router.put('/:id',                ctrl.updateRider);

// PATCH  /api/admin/riders/:id/status — activate (available) or deactivate (inactive)
router.patch('/:id/status',       ctrl.updateRiderStatus);

// POST   /api/admin/riders/:id/reset-password — admin sets a new password
router.post('/:id/reset-password', ctrl.resetRiderPassword);

module.exports = router;