-- Preserve the amount handed over for cash payments so transaction history
-- can show it later. Existing payment records remain NULL because the value
-- was not stored before this migration.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS cash_given NUMERIC(10, 2);
