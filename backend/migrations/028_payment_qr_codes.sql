-- Migration 028: payment QR codes
-- Run once against your PostgreSQL database.
--
-- `payment_qr_codes` stores the e-wallet QR images the admin uploads. The
-- image itself lives in Cloudinary; only the URL/public_id are kept here.
-- The customer app shows the active codes at checkout.
--
-- The delivery fee does NOT need a schema change: it is stored in the
-- existing `system_settings` table under the key 'delivery_fee'.

CREATE TABLE IF NOT EXISTS public.payment_qr_codes (
  id              SERIAL PRIMARY KEY,
  name            varchar(100) NOT NULL,
  number          varchar(50)  NOT NULL,
  image_url       text         NOT NULL,
  image_public_id varchar(255),
  is_active       boolean      NOT NULL DEFAULT true,
  display_order   integer      NOT NULL DEFAULT 0,
  created_by      integer      REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  created_at      timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_qr_codes_active
  ON public.payment_qr_codes (is_active, display_order, id);

COMMENT ON TABLE public.payment_qr_codes IS
  'Admin-managed e-wallet QR codes (GCash, Maya, etc.) shown to customers at checkout.';
