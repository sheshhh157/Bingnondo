const express = require('express');
const router = express.Router();
const authController   = require('./auth.controller');

const { authenticateToken } = require('../../middleware/auth.middleware');

// ── Shared Login (Staff + Rider) ───────────────────────────────────────────────
// POST /api/auth/login
// Checks staff_accounts first, then riders table.
// Returns JWT with type='staff' or type='rider'.
router.post('/login', authController.login);

// ── Staff Auth (kept for backward compatibility) ───────────────────────────────
// POST /api/auth/staff/login
router.post('/staff/login', authController.staffLogin);

// ── Forgot / Reset Password (staff only) ──────────────────────────────────────
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);

// ── Token Management ───────────────────────────────────────────────────────────
router.post('/refresh', authController.refreshToken);
router.post('/logout',  authenticateToken, authController.logout);
router.get('/me',       authenticateToken, authController.me);



module.exports = router;