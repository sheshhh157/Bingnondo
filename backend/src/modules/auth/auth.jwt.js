const jwt = require('jsonwebtoken');

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'bingnondo_access_secret_change_in_prod';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'bingnondo_refresh_secret_change_in_prod';

const ACCESS_EXPIRY  = process.env.JWT_ACCESS_EXPIRY  || '30m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

/**
 * Sign an access token.
 * @param {{ sub: number, type: 'customer'|'staff', role: string }} payload
 */
function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

/**
 * Sign a refresh token.
 * @param {{ sub: number, type: 'customer'|'staff', role: string }} payload
 */
function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

/**
 * Verify an access token.
 * Returns the decoded payload or null if invalid/expired.
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch {
    return null;
  }
}

/**
 * Verify a refresh token.
 * Returns the decoded payload or null if invalid/expired.
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch {
    return null;
  }
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };