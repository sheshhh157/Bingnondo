// Shared field checks for the input handlers. Each returns a user-facing
// error message, or null when the value is acceptable, so handlers stay close
// to the existing `if (err) return res.status(400)...` style.

// NUMERIC(10,2) columns cannot hold more than ~8 digits before the point;
// everything validated here funnels into columns of that shape.
const MAX_NUMERIC = 99999999.99;

// Menu prices are whole pesos on this counter, so 0..1000 covers the menu
// without letting an absurd figure through.
const MAX_PRICE = 1000;

// Length cap matching a VARCHAR(n)/policy bound. Non-string input and empty
// strings pass here; the handler's required check handles those.
function lengthCap(value, label, max) {
  if (typeof value !== 'string') return null;
  if (value.trim().length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

// Finite-number check with range. Bare Number("") is 0, which silently
// turns an empty field into a valid zero, so "" is rejected explicitly.
// `exclusive` makes the lower bound strict (`> min`), for quantities that
// must be positive rather than merely non-negative.
function numInRange(value, label, { min = 0, exclusive = false, max = MAX_NUMERIC } = {}) {
  if (value === undefined || value === null || value === '') {
    return `${label} is required.`;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} must be a valid number.`;
  if (exclusive ? n <= min : n < min) {
    return exclusive ? `${label} must be greater than ${min}.` : `${label} must be at least ${min}.`;
  }
  if (n > max) return `${label} must not exceed ${max}.`;
  return null;
}

module.exports = { lengthCap, numInRange, MAX_NUMERIC, MAX_PRICE };
