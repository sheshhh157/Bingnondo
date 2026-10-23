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
 *
 * The customer (mobile app) needs two more top-ups:
 *   - customer_notifications: the app's own notification feed. The existing
 *     `notifications` table is staff-shaped (staff_id / target_role), so the
 *     app gets its own table rather than sharing a feed with the staff bell.
 *   - support_chat_messages.is_read: the app marks staff replies as read.
 */

const db = require('./db');

const STATEMENTS = [
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude  NUMERIC(10,7)`,
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7)`,
  `ALTER TABLE orders    ADD COLUMN IF NOT EXISTS delivery_address   TEXT`,
  `ALTER TABLE orders    ADD COLUMN IF NOT EXISTS delivery_latitude  NUMERIC(10,7)`,
  `ALTER TABLE orders    ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(10,7)`,

  // ── Customer app ──────────────────────────────────────────────────────────
  `ALTER TABLE support_chat_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE`,

  // A reset code stays redeemable after the app verifies it, but only once.
  // `consumed_at` records the redemption so a replayed code is rejected.
  `ALTER TABLE otp_verifications ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMP`,

  `CREATE TABLE IF NOT EXISTS customer_notifications (
     id                SERIAL PRIMARY KEY,
     customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
     type              VARCHAR(50)  NOT NULL,
     message           TEXT         NOT NULL,
     related_order_id  INTEGER      REFERENCES orders(id) ON DELETE SET NULL,
     is_read           BOOLEAN      NOT NULL DEFAULT FALSE,
     created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,

  // The app reads the newest notifications first.
  `CREATE INDEX IF NOT EXISTS idx_customer_notifications_customer
     ON customer_notifications (customer_id, created_at DESC)`,
];

async function ensureSchema() {
  for (const sql of STATEMENTS) {
    await db.query(sql);
  }
  console.log('[schema] ensured: address pin columns, customer_notifications, support_chat_messages.is_read');
}

module.exports = ensureSchema;
