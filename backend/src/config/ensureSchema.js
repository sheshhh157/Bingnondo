'use strict';

/**
 * ensureSchema.js  —  Idempotent schema top-ups (staff/rider backend)
 * ─────────────────────────────────────────────────────────────────────────────
 * Mirrors bingnondo_backend/src/config/ensureSchema.js. Both backends share the
 * same database (bingnondo_db). Running it from either side is safe: every
 * statement uses IF NOT EXISTS.
 *
 * Orders now carry a per-order delivery snapshot (address + coordinates) that
 * overrides customers.address, so riders/admin always see the pin the customer
 * actually confirmed at checkout.
 */

const db = require('./db');

const STATEMENTS = [
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7)`,
  `ALTER TABLE orders    ADD COLUMN IF NOT EXISTS delivery_address   TEXT`,
  `ALTER TABLE orders    ADD COLUMN IF NOT EXISTS delivery_latitude  NUMERIC(10,7)`,
  `ALTER TABLE orders    ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(10,7)`,
];

async function ensureSchema() {
  for (const sql of STATEMENTS) {
    await db.query(sql);
  }
  console.log('[schema] ensured: address pin location columns');
}

module.exports = ensureSchema;
