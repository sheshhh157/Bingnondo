-- Migration: add previous_rejection_reason to payments table
-- Run once against your PostgreSQL database.
--
-- The customer re-upload flow clears payments.rejection_reason: once the
-- customer sends a new receipt the payment is back in the verification queue,
-- so it no longer carries a rejection. The cashier's online-orders console
-- still wants to show WHY the customer had to re-upload, so the reason is
-- copied into its own column at rejection time and kept there.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS previous_rejection_reason varchar(255) DEFAULT NULL;

-- Backfill: rows that are rejected right now still carry the reason.
UPDATE public.payments
   SET previous_rejection_reason = rejection_reason
 WHERE rejection_reason IS NOT NULL
   AND previous_rejection_reason IS NULL;

COMMENT ON COLUMN public.payments.previous_rejection_reason IS
  'Why the receipt was rejected. Copied from rejection_reason when staff rejects a receipt, '
  'and kept after the customer re-uploads (the re-upload clears rejection_reason). '
  'NULL means the receipt was never rejected.';
