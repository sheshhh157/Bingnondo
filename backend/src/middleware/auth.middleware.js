const { verifyAccessToken } = require('../modules/auth/auth.jwt');

/**
 * authenticateToken
 * ─────────────────
 * Extracts Bearer token from Authorization header, verifies it,
 * and attaches the decoded payload to req.user.
 *
 * req.user shape: { sub, type: 'customer'|'staff', role, iat, exp }
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ message: 'Invalid or expired token. Please sign in again.' });
  }

  req.user = decoded;
  next();
}

/**
 * requireRoles(...roles)
 * ──────────────────────
 * Role-based access control — must be used AFTER authenticateToken.
 *
 * Usage:
 *   router.get('/admin/accounts', authenticateToken, requireRoles('admin'), handler);
 *   router.post('/orders', authenticateToken, requireRoles('cashier', 'staff'), handler);
 *
 * @param {...string} roles - allowed role strings
 */
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You don't have permission to perform this action." });
    }
    next();
  };
}

/**
 * requireStaff
 * ─────────────
 * Shorthand — blocks customers from hitting staff-only routes.
 */
function requireStaff(req, res, next) {
  if (!req.user || req.user.type !== 'staff') {
    return res.status(403).json({ message: "You don't have permission to perform this action." });
  }
  next();
}

/**
 * requireCustomer
 * ────────────────
 * Blocks staff accounts from hitting customer-only routes (e.g. mobile app).
 */
function requireCustomer(req, res, next) {
  if (!req.user || req.user.type !== 'customer') {
    return res.status(403).json({ message: "You don't have permission to perform this action." });
  }
  next();
}

module.exports = { authenticateToken, requireRoles, requireStaff, requireCustomer };