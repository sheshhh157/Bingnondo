const express = require('express');
const router  = express.Router();

const { authenticateToken, requireRoles } = require('../../middleware/auth.middleware');
const ctrl = require('./admin.notifications.controller');

// All notification routes are admin-only
router.use(authenticateToken, requireRoles('admin'));

// GET  /api/admin/notifications      — merged system activity feed
router.get('/', ctrl.getNotifications);

// POST /api/admin/notifications/seen — mark the feed as read
router.post('/seen', ctrl.markSeen);

module.exports = router;
