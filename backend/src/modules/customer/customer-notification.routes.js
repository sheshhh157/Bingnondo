/**
 * customer-notification.routes.js
 * ────────────────────────────────
 * Notification read receipts, mounted at /api/notifications by server.js.
 *
 *   PUT /api/notifications/read-all
 *   PUT /api/notifications/:id/read
 *
 * 'read-all' is registered first: Express matches in order, so the literal
 * path has to be declared before the ':id' parameter or 'read-all' would be
 * parsed as an id.
 */

const express = require('express');
const { authenticateToken, requireCustomer } = require('../../middleware/auth.middleware');
const ctrl = require('./customer.controller');

const router = express.Router();

/** PUT /api/notifications/read-all */
router.put('/read-all', authenticateToken, requireCustomer, ctrl.markAllNotificationsRead);

/** PUT /api/notifications/:id/read */
router.put('/:id/read', authenticateToken, requireCustomer, ctrl.markNotificationRead);

module.exports = router;
