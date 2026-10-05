const express = require('express');
const router = express.Router();
const authController   = require('./auth.controller');
const switchController = require('./auth.switch.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

// ── Staff Auth ─────────────────────────────────────────────────────────────────
// POST /api/auth/staff/login
router.post('/staff/login', authController.staffLogin);

// ── Forgot / Reset Password (staff only) ──────────────────────────────────────
// POST /api/auth/forgot-password  — sends OTP to staff email
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password  — verifies OTP + sets new password
router.post('/reset-password', authController.resetPassword);

// ── Token Management ───────────────────────────────────────────────────────────
// POST /api/auth/refresh  — swap refresh token for new access token
router.post('/refresh', authController.refreshToken);

// POST /api/auth/logout
router.post('/logout', authenticateToken, authController.logout);

// GET /api/auth/me  — return current staff user from token (used by AuthContext on reload)
router.get('/me', authenticateToken, authController.me);

// ── Dashboard Switch (staff only — no logout required) ─────────────────────────
// GET  /api/auth/staff/switch-options       — get list of dashboards staff can switch to
//                                             (used to build the dropdown)
router.get('/staff/switch-options', authenticateToken, switchController.getSwitchOptions);

// POST /api/auth/staff/switch-dashboard     — perform the switch (with optional PIN)
router.post('/staff/switch-dashboard', authenticateToken, switchController.switchDashboard);

// POST /api/auth/staff/switch-pin/update   — staff updates their own switch PIN
router.post('/staff/switch-pin/update', authenticateToken, switchController.updateOwnSwitchPin);

module.exports = router;