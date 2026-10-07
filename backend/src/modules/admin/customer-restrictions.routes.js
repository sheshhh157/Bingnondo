const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./customer-restrictions.controller');

// All customer restriction routes require a valid JWT AND 'admin' or 'owner' role.
// §6.4 in the flow doc explicitly says: "Customer Restrictions (Admin/Owner)"
router.use(authenticateToken, requireRoles('admin', 'owner'));

// GET  /api/admin/customer-restrictions
//   List all customers with violations or non-default restrictions.
//   Query: page, limit, search, restriction_level
router.get('/', ctrl.listCustomerRestrictions);

// GET  /api/admin/customer-restrictions/:customer_id/violations
//   Full violation history for one customer (newest first).
router.get('/:customer_id/violations', ctrl.getCustomerViolations);

// PATCH /api/admin/customer-restrictions/:customer_id
//   Manually override a customer's restriction level.
//   Body: { restriction_level, reason }
router.patch('/:customer_id', ctrl.overrideCustomerRestriction);

module.exports = router;