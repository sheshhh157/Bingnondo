-- Migration: add gcash_amount_sent to payments table
-- Run once against your PostgreSQL database.
--
-- gcash_amount_sent  — the amount the customer scanned from their GCash receipt.
--   May be NULL if OCR couldn't extract it (staff verifies manually).
--   Separate from `amount` (which is the computed order total from the DB).
--   Staff can compare the two to catch short payments.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS gcash_amount_sent numeric(10,2) DEFAULT NULL;

COMMENT ON COLUMN public.payments.gcash_amount_sent IS
  'Amount extracted from the customer''s GCash receipt screenshot via OCR. '
  'NULL means OCR could not read it — staff must verify manually. '
  'Compare against `amount` to detect short payments.';
