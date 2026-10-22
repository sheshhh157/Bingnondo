-- Migration: add resubmitted_at and rejection_count to payments table
-- Run once against your PostgreSQL database.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS resubmitted_at  timestamp without time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_count integer                      DEFAULT 0;

-- Backfill rejection_count for existing rejected/resubmitted rows
-- (counts how many times rejected_at was set — best estimate from existing data)
UPDATE public.payments
   SET rejection_count = 1
 WHERE rejected_at IS NOT NULL
   AND rejection_count = 0;

COMMENT ON COLUMN public.payments.resubmitted_at IS
  'Timestamp of the most recent customer re-upload after a rejection. '
  'NULL means never re-submitted.';

COMMENT ON COLUMN public.payments.rejection_count IS
  'How many times this payment has been rejected so far. '
  'Incremented when staff rejects. Helps cashier know if this is a repeat offender.';
