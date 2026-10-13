-- ============================================================
-- MIGRATION 008 — Add esp32_devices table
-- Run: psql $DATABASE_URL -f migrations/008_esp32_devices.sql
--
-- Why: GET /api/kitchen/alerts LEFT JOINs esp32_devices
--      (backend/src/modules/kitchen/kitchen.controller.js), but the table
--      was missing from the imported schema, so the endpoint failed with
--      PostgreSQL error 42P01 (relation "esp32_devices" does not exist).
--      kitchen_alerts.device_id references this table.
--
-- Definition mirrors the existing "bingnondo" database exactly.
-- Safe to run multiple times (IF NOT EXISTS / guarded DO blocks).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS esp32_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS esp32_devices (
    id             integer      NOT NULL DEFAULT nextval('esp32_devices_id_seq'::regclass),
    device_code    text         NOT NULL,
    location_label text         NOT NULL,
    created_at     timestamp with time zone NOT NULL DEFAULT now(),
    status         text         NOT NULL DEFAULT 'offline',
    last_ping_at   timestamp with time zone NOT NULL DEFAULT now()
);

ALTER SEQUENCE esp32_devices_id_seq OWNED BY esp32_devices.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'esp32_devices_pkey'
    ) THEN
        ALTER TABLE esp32_devices
            ADD CONSTRAINT esp32_devices_pkey PRIMARY KEY (id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_alerts_device_id_fkey'
    ) THEN
        ALTER TABLE kitchen_alerts
            ADD CONSTRAINT kitchen_alerts_device_id_fkey
            FOREIGN KEY (device_id) REFERENCES esp32_devices(id);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_esp32_devices_device_code_unique
    ON esp32_devices USING btree (device_code);

-- Seed device (idempotent)
INSERT INTO esp32_devices (device_code, location_label, status)
VALUES ('ESP32-KitchenA', 'Kitchen Counter A', 'online')
ON CONFLICT (device_code) DO NOTHING;

-- ============================================================
-- END OF MIGRATION 008
-- ============================================================
