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

  // ── Rider live-location tracking ──────────────────────────────────────────
  // Stores the most recent GPS fix for each rider during an active delivery.
  // One row per rider (upsert pattern). Cleared / ignored when no delivery is active.
  `CREATE TABLE IF NOT EXISTS rider_locations (
     rider_id    INTEGER PRIMARY KEY REFERENCES riders(id) ON DELETE CASCADE,
     latitude    NUMERIC(10,7) NOT NULL,
     longitude   NUMERIC(10,7) NOT NULL,
     accuracy    REAL,
     updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,

  `CREATE INDEX IF NOT EXISTS idx_rider_locations_updated
     ON rider_locations (updated_at DESC)`,

  // ── Delivery batching ─────────────────────────────────────────────────────
  // A batch groups up to 10 delivery orders for a single rider trip.
  // Timer starts when the first order is added (batch_started_at).
  // Batch dispatches when: 10 orders collected OR 20-min timer expires.
  // After dispatch, OSRM computes nearest-first route and sets stop_sequence.
  `CREATE TABLE IF NOT EXISTS delivery_batches (
     id              SERIAL PRIMARY KEY,
     rider_id        INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
     status          VARCHAR(20) NOT NULL DEFAULT 'waiting'
                       CHECK (status IN ('waiting','in_progress','completed')),
     batch_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     dispatched_at   TIMESTAMP,
     completed_at    TIMESTAMP
   )`,

  `CREATE INDEX IF NOT EXISTS idx_delivery_batches_rider_status
     ON delivery_batches (rider_id, status)`,

  // Each delivery row gets a FK to its batch and an ordered stop position.
  `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS batch_id       INTEGER REFERENCES delivery_batches(id) ON DELETE SET NULL`,
  `ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS stop_sequence  SMALLINT`,

  // Soft-delete snapshots for admin-managed records. Archived entries are
  // restorable for 30 days, then purged by the archive cleanup task.
  `CREATE TABLE IF NOT EXISTS archived_records (
     id           BIGSERIAL PRIMARY KEY,
     entity_type  VARCHAR(40) NOT NULL,
     entity_id    BIGINT NOT NULL,
     display_name TEXT NOT NULL,
     payload      JSONB NOT NULL,
     archived_by INTEGER,
     archived_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
     expires_at  TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')
   )`,
  `CREATE INDEX IF NOT EXISTS idx_archived_records_expires_at
     ON archived_records (expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_archived_records_entity
     ON archived_records (entity_type, entity_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_archived_records_entity
     ON archived_records (entity_type, entity_id)`,
  `INSERT INTO archived_records
     (entity_type, entity_id, display_name, payload, archived_at, expires_at)
   SELECT 'menu_item',
          mi.id,
          mi.name,
          jsonb_build_object(
            'is_available', mi.is_available,
            'image_public_id', mi.image_public_id
          ),
          COALESCE(mi.deleted_at, CURRENT_TIMESTAMP),
          COALESCE(mi.deleted_at, CURRENT_TIMESTAMP) + INTERVAL '30 days'
     FROM menu_items mi
    WHERE mi.is_deleted = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM archived_records a
         WHERE a.entity_type = 'menu_item' AND a.entity_id = mi.id
      )`,
];

async function ensureSchema() {
  for (const sql of STATEMENTS) {
    await db.query(sql);
  }
  console.log('[schema] ensured: address pin columns, customer_notifications, support_chat_messages.is_read, rider_locations, delivery_batches');
}

module.exports = ensureSchema;