const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRider } = require('../../middleware/auth.middleware');
const ctrl = require('./rider.controller');

// All routes in this file require a valid JWT with type='rider'
router.use(authenticateToken, requireRider);

// ── 7.2 Active Delivery ────────────────────────────────────────────────────────
router.get  ('/delivery/current',    ctrl.getCurrentDelivery);   // GET  /api/rider/delivery/current
router.patch('/delivery/:id/status', ctrl.updateDeliveryStatus); // PATCH /api/rider/delivery/:id/status

// ── 7.3 Delivery History ───────────────────────────────────────────────────────
router.get  ('/deliveries',          ctrl.getDeliveryHistory);   // GET  /api/rider/deliveries?page=&limit=

// ── Rider Profile (used by RiderProfile.jsx) ───────────────────────────────────
router.get  ('/profile',             ctrl.getProfile);           // GET  /api/rider/profile
router.patch('/profile',             ctrl.updateProfile);        // PATCH /api/rider/profile

module.exports = router;