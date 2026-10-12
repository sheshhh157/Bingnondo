-- ============================================================
-- MIGRATION 007 — Add GCash receipt columns to payments table
-- Run: psql $DATABASE_URL -f migrations/007_payments_gcash_columns.sql
--
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING).
-- ============================================================

-- GCash receipt fields (all nullable — only populated for GCash online orders)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gcash_ref_number    VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS receipt_image_url   VARCHAR(500) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS receipt_uploaded_at TIMESTAMP    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_by         INTEGER      DEFAULT NULL
                               REFERENCES staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMP    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason    VARCHAR(255) DEFAULT NULL;

-- Extend the status CHECK to include 'awaiting_verification' and 'rejected'
-- (DROP the old constraint first, then add the new one)
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'awaiting_verification', 'paid', 'rejected', 'refunded'));

-- Index: fast lookup for the staff payment queue
CREATE INDEX IF NOT EXISTS idx_payments_gcash_pending
  ON payments (status)
  WHERE status IN ('awaiting_verification', 'rejected');

-- ============================================================
-- END OF MIGRATION 007
-- ============================================================