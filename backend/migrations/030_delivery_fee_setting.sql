-- Migration 030: ensure the delivery-fee setting exists.
-- Delivery-fee configuration is stored in system_settings.value as JSONB,
-- under the key 'delivery_fee'; it does not use a separate table.
--
-- Preserve an existing value if an administrator has already configured it.
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('delivery_fee', '{"enabled": false, "amount": 0}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;
