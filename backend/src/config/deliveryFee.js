const db = require('./db');

// Stored under system_settings.key = 'delivery_fee' as JSONB:
//   { "enabled": true, "amount": 49 }
const SETTINGS_KEY = 'delivery_fee';

const DEFAULT_DELIVERY_FEE = Object.freeze({ enabled: false, amount: 0 });

/**
 * Normalise whatever is stored in system_settings into a predictable shape.
 * Anything malformed falls back to the default (fee off).
 */
function normalizeDeliveryFee(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_DELIVERY_FEE };
  }

  const amount = Number(value.amount);
  return {
    enabled: value.enabled === true,
    amount: Number.isFinite(amount) && amount > 0
      ? Math.round(amount * 100) / 100
      : 0,
  };
}

/**
 * Read the current delivery-fee config. Accepts an optional pg client so the
 * caller can read inside an existing transaction.
 */
async function readDeliveryFee(client = db) {
  const { rows } = await client.query(
    'SELECT value FROM system_settings WHERE key = $1',
    [SETTINGS_KEY]
  );
  return normalizeDeliveryFee(rows[0]?.value);
}

module.exports = {
  SETTINGS_KEY,
  DEFAULT_DELIVERY_FEE,
  normalizeDeliveryFee,
  readDeliveryFee,
};
