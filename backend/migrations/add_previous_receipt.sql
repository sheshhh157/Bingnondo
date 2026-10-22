-- Migration: store original rejected receipt URL so cashier can compare both
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS previous_receipt_image_url text DEFAULT NULL;

COMMENT ON COLUMN public.payments.previous_receipt_image_url IS
  'The receipt URL that was rejected. Saved when customer re-uploads so '
  'cashier can compare the original rejected receipt vs the new one side by side.';
