const jwt = require('jsonwebtoken');

// Secrets are validated once at require time: a missing, weak or leaked
// placeholder secret must stop the process from starting, not ship tokens
// signed with a guessable key.
const WEAK_MARKERS = ['change_me', 'change_in_prod'];

function requireSecret(name, otherName) {
  const value = process.env[name];
  const problems = [];
  if (!value) problems.push('it is missing');
  if (value && value.length < 32) problems.push('it is shorter than 32 characters');
  if (value && WEAK_MARKERS.some((m) => value.includes(m))) {
    problems.push('it still contains a change_me/change_in_prod placeholder');
  }
  if (value && otherName && process.env[otherName] === value) {
    problems.push('it is identical to the other JWT secret');
  }
  if (problems.length > 0) {
    throw new Error(
      `[config] ${name} is not acceptable: ${problems.join('; ')}. ` +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return value;
}

const ACCESS_SECRET  = requireSecret('JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET');
const REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET', 'JWT_ACCESS_SECRET');

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