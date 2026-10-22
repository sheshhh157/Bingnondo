/**
 * chatbot.routes.js
 * ─────────────────
 * Mounted at /api/chatbot by server.js.
 *
 *   POST /api/chatbot/message   { message }
 *   GET  /api/chatbot/history
 *
 * Both need a customer identity — the transcript belongs to a customer.
 */

const express = require('express');
const { authenticateToken, requireCustomer } = require('../../middleware/auth.middleware');
const ctrl = require('./chatbot.controller');

const router = express.Router();

/** POST /api/chatbot/message */
router.post('/message', authenticateToken, requireCustomer, ctrl.sendMessage);

/** GET /api/chatbot/history */
router.get('/history', authenticateToken, requireCustomer, ctrl.getHistory);

module.exports = router;
