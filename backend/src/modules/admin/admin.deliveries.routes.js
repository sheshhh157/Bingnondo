const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.deliveries.controller');

// Read-only: admins manage riders, managers/owners get a read-only delivery view.
router.use(authenticateToken, requireRoles('admin', 'owner', 'manager'));

// GET /api/admin/deliveries — list deliveries (filterable by ?status=, ?search=)
router.get('/', ctrl.listDeliveries);

module.exports = router;
