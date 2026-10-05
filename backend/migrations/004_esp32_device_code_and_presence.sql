-- 004_esp32_device_code_and_presence.sql
--
-- Aligns esp32_devices with the design schema and what the ESP32 code
-- actually queries. Three fixes in one migration:
--
-- 1. RENAME device_name -> device_code. The column had zero readers in
--    backend/ or frontend/ (verified by grep). The design schema specifies
--    device_code, the firmware sends it, every route filters on it, and the
--    Admin UI already renders it. One row to backfill.
--
-- 2. ADD status + last_ping_at. The heartbeat in
--    src/modules/kitchen/esp32.routes.js UPDATEs both on every poll, so
--    presence is tracked free of charge. The Admin UI reads is_online; no
--    column backed it until now.
--
-- 3. UNIQUE on device_code. Required by
--    esp32-buzzer/sql/seed_esp32_device.sql's ON CONFLICT (device_code) clause,
--    which fails without it. The index is created after the migration commits,
--    so it is safe to wrap everything in a single transaction.

BEGIN;

-- Step 1: rename existing column. The existing row has device_name =
-- 'ESP32-KitchenA', location_label = 'Kitchen Counter A'.
--
-- Guarded: a database restored from bingnondo_database.sql already has
-- device_code directly, so the RENAME only runs when device_name is still
-- present (i.e. on databases that predate the rename).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'esp32_devices' AND column_name = 'device_name'
  ) THEN
    ALTER TABLE esp32_devices RENAME COLUMN device_name TO device_code;
  END IF;
END $$;

-- Step 2: backfill device_code from the old device_name value. If for some
-- reason that row is gone, provide a deterministic fallback so the column
-- is never NULL after the NOT NULL constraint below.
UPDATE esp32_devices
   SET device_code = COALESCE(device_code, 'ESP32-KitchenA')
 WHERE device_code IS NULL OR device_code = '';

ALTER TABLE esp32_devices ALTER COLUMN device_code SET NOT NULL;

-- Step 3: add presence columns. The firmware polls every 2 seconds and
-- writes status='online' / last_ping_at=NOW() on each poll. No code ever
-- resets status to 'offline', so presence is effectively derived from
-- last_ping_at age, but storing a flag avoids a NULL-check in the query.
ALTER TABLE esp32_devices
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS last_ping_at timestamptz NOT NULL DEFAULT now();

-- Step 4: UNIQUE index. Seed SQL uses ON CONFLICT (device_code) DO NOTHING,
-- which requires a unique index. A plain index is sufficient at this size
-- — the 003 note about write-lock duration is acknowledged but not
-- practically relevant here. CONCURRENTly would require a separate
-- non-transactional step, so we create it after COMMIT for correctness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_esp32_devices_device_code_unique
  ON esp32_devices (device_code);

COMMIT;