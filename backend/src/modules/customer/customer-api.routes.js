/**
 * customer-api.routes.js
 * ───────────────────────
 * Customer account endpoints, mounted at /api/customer by server.js.
 *
 *   GET    /api/customer/profile
 *   PUT    /api/customer/profile
 *   GET    /api/customer/notifications
 *   DELETE /api/customer/saved-payment
 */

const express = require('express');
const { authenticateToken, requireCustomer } = require('../../middleware/auth.middleware');
const ctrl = require('./customer.controller');

const router = express.Router();

/** GET /api/customer/profile */
router.get('/profile', authenticateToken, requireCustomer, ctrl.getProfile);

/** PUT /api/customer/profile */
router.put('/profile', authenticateToken, requireCustomer, ctrl.updateProfile);

/** GET /api/customer/notifications */
router.get('/notifications', authenticateToken, requireCustomer, ctrl.getNotifications);

/** DELETE /api/customer/saved-payment */
router.delete('/saved-payment', authenticateToken, requireCustomer, ctrl.removeSavedPayment);

module.exports = router;
