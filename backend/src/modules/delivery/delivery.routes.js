const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./delivery.controller');

// ── Middleware sets ────────────────────────────────────────────────────────────
const staffAccess = [authenticateToken, requireStaff, requireRoles('staff', 'owner', 'admin')];

function requireRider(req, res, next) {
  if (!req.user || req.user.type !== 'rider') {
    return res.status(403).json({ message: "You don't have permission to perform this action." });
  }
  next();
}

// ─── §4.3 Staff: Delivery Assignment ─────────────────────────────────────────

// GET    /api/deliveries             — all deliveries (filterable by ?status=)
router.get('/', ...staffAccess, ctrl.getDeliveries);

// POST   /api/deliveries/:id/assign  — assign registered rider or ad-hoc name+contact
router.post('/:id/assign', ...staffAccess, ctrl.assignDelivery);

// PATCH  /api/deliveries/:id/status  — update delivery status (staff)
router.patch('/:id/status', ...staffAccess, ctrl.updateDeliveryStatus);

module.exports = router;