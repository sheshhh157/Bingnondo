/**
 * support-chat.routes.js
 * ───────────────────────
 * Mounts all Support Chat endpoints.
 *
 * Customer routes  → require customer JWT (type='customer')
 * Staff routes     → require staff JWT  (type='staff') + allowed roles
 */

const router = require('express').Router();
const {
  authenticateToken,
  requireCustomer,
  requireStaff,
  requireRoles,
} = require('../../middleware/auth.middleware');

const ctrl = require('./support-chat.controller');

// ─── Customer routes ──────────────────────────────────────────────────────────

// GET /api/support-chat
// Returns the customer's thread status + messages.
// If locked (no active order), returns a UI message instead.
router.get(
  '/',
  authenticateToken,
  requireCustomer,
  ctrl.getOrCreateThread
);

// POST /api/support-chat/message
// Customer sends a message. Gate: thread must be unlocked.
// Body: { content: string, related_order_id?: number }
router.post(
  '/message',
  authenticateToken,
  requireCustomer,
  ctrl.sendCustomerMessage
);

// ─── Staff routes ─────────────────────────────────────────────────────────────

// GET /api/support-chat/threads
// Lists all customer threads (unlocked first).
// Optional query: ?status=unlocked|locked|all  ?customer_id=<n>
router.get(
  '/threads',
  authenticateToken,
  requireStaff,
  requireRoles('staff', 'cashier', 'owner', 'admin'),
  ctrl.getAllThreads
);

// GET /api/support-chat/threads/:chatId/messages
// Full message history for a specific thread.
router.get(
  '/threads/:chatId/messages',
  authenticateToken,
  requireStaff,
  requireRoles('staff', 'cashier', 'owner', 'admin'),
  ctrl.getThreadMessages
);

// POST /api/support-chat/reply
// Staff sends a reply to a customer thread.
// Body: { chat_id: number, content: string, related_order_id?: number }
router.post(
  '/reply',
  authenticateToken,
  requireStaff,
  requireRoles('staff', 'cashier', 'owner', 'admin'),
  ctrl.sendStaffReply
);

module.exports = router;