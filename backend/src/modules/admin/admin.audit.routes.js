const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.controller');

// All audit-log routes are admin-only
router.use(authenticateToken, requireRoles('admin'));

// GET /api/admin/audit-log — chronological administrative action history
router.get('/', ctrl.getAuditLog);

module.exports = router;
