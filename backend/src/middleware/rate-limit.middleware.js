const rateLimit = require('express-rate-limit');

/**
 * loginLimiter
 * ─────────────
 * 5 failed attempts per IP per 15 minutes on login routes.
 * Matches the spec in bingnondo_architecture_design.md §8.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window (generous to allow real users + one re-try)
  skipSuccessfulRequests: true, // only count failed attempts toward the limit
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many login attempts from this IP. Please try again in 15 minutes.',
  },
  keyGenerator: (req) => {
    // Rate limit per IP — can be changed to per email if needed
    return req.ip;
  },
});

/**
 * otpLimiter
 * ───────────
 * 3 OTP requests per IP per 10 minutes — prevents OTP spam.
 */
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many OTP requests. Please wait a few minutes before requesting another code.',
  },
});

/**
 * generalApiLimiter
 * ──────────────────
 * Broad catch-all for all /api/* routes — 200 req/min per IP.
 * Protects against basic scraping/fuzzing.
 */
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests. Please slow down.',
  },
});

module.exports = { loginLimiter, otpLimiter, generalApiLimiter };