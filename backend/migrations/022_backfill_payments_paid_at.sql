-- 022_backfill_payments_paid_at.sql
-- Ensure created_at exists, then backfill paid_at as COALESCE(created_at, NOW()).
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE payments
SET paid_at = COALESCE(created_at, NOW())
WHERE status = 'paid' AND paid_at IS NULL;
