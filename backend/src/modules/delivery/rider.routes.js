/**
 * rider.routes.js
 * ─────────────────
 * Two sets of routes in one file:
 *
 *   GET /api/riders?status=available
 *     Staff read-only — rider dropdown used during delivery assignment (§4.3).
 *     Mounted at /api/riders in server.js.
 *
 *   GET  /api/rider/delivery/current    — rider's active delivery
 *   GET  /api/rider/deliveries          — rider's delivery history
 *   PATCH /api/rider/delivery/:id/status — rider marks OFD or delivered
 *     Mounted at /api/rider in server.js.
 */

const express = require('express');

const { authenticateToken, requireRoles, requireStaff } = require('../../middleware/auth.middleware');
const ctrl = require('./delivery.controller');

// ── Staff read: available riders dropdown ─────────────────────────────────────
const ridersRouter = express.Router();
const staffAccess  = [authenticateToken, requireStaff, requireRoles('staff', 'owner', 'admin')];

// GET /api/riders?status=available
ridersRouter.get('/', ...staffAccess, ctrl.getAvailableRiders);

// ── Rider-scoped routes ───────────────────────────────────────────────────────
const riderRouter = express.Router();

function requireRider(req, res, next) {
  if (!req.user || req.user.type !== 'rider') {
    return res.status(403).json({ message: "You don't have permission to perform this action." });
  }
  next();
}

// GET   /api/rider/delivery/current   — current active delivery
riderRouter.get('/delivery/current',        authenticateToken, requireRider, ctrl.getRiderCurrentDelivery);

// GET   /api/rider/deliveries         — delivery history
riderRouter.get('/deliveries',              authenticateToken, requireRider, ctrl.getRiderDeliveries);

// PATCH /api/rider/delivery/:id/status — update own delivery status
riderRouter.patch('/delivery/:id/status',   authenticateToken, requireRider, ctrl.updateRiderDeliveryStatus);

module.exports = { ridersRouter, riderRouter };