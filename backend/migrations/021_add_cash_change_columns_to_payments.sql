-- 021_add_cash_change_columns_to_payments.sql
-- Add cash_given and change_given columns to payments for cash tracking.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_given numeric(10,2) DEFAULT NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS change_given numeric(10,2) DEFAULT NULL;
