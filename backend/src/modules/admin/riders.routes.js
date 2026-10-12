const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./riders.controller');

// ── GET /api/admin/riders/available ──────────────────────────────────────────
// Must be defined BEFORE /:id so Express matches it first.
// Accessible to both admin and staff (staff needs it for delivery assignment).
router.get(
  '/available',
  authenticateToken,
  requireRoles('admin', 'staff'),
  ctrl.listAvailableRiders
);

// ── Admin-only rider management ───────────────────────────────────────────────
// All routes below require a valid JWT with role = 'admin'.
router.use(authenticateToken, requireRoles('admin'));

// GET    /api/admin/riders          — paginated list with search + status filter
router.get('/',      ctrl.listRiders);

// GET    /api/admin/riders/:id      — single rider detail
router.get('/:id',   ctrl.getRider);

// POST   /api/admin/riders          — register a new rider
router.post('/',     ctrl.createRider);

// PUT    /api/admin/riders/:id      — update name / contact / vehicle details
router.put('/:id',   ctrl.updateRider);

// PATCH  /api/admin/riders/:id/status   — activate or deactivate (available|inactive)
router.patch('/:id/status', ctrl.updateRiderStatus);

// POST   /api/admin/riders/:id/reset-password   — admin resets rider login password
router.post('/:id/reset-password', ctrl.resetRiderPassword);

module.exports = router;