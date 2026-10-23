/**
 * customer.routes.js
 * ──────────────────
 * Customer authentication routes.
 *
 * Mounted at /api/auth/customer by server.js:
 *   POST /api/auth/customer/register
 *   POST /api/auth/customer/verify-otp
 *   POST /api/auth/customer/resend-otp
 *   POST /api/auth/customer/login
 *
 * The account/profile routes live in customer-api.routes.js and the read
 * receipts in customer-notification.routes.js.
 */

const express = require('express');
const ctrl = require('./customer.controller');

const router = express.Router();

/** POST /api/auth/customer/register */
router.post('/register', ctrl.register);

/** POST /api/auth/customer/verify-otp */
router.post('/verify-otp', ctrl.verifyOtp);

/** POST /api/auth/customer/resend-otp */
router.post('/resend-otp', ctrl.resendOtp);

/** POST /api/auth/customer/login */
router.post('/login', ctrl.login);

module.exports = router;
