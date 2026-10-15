const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.deliveries.controller');

// Read-only delivery view (admin only).
router.use(authenticateToken, requireRoles('admin'));

// GET /api/admin/deliveries — list deliveries (filterable by ?status=, ?search=)
router.get('/', ctrl.listDeliveries);

module.exports = router;
