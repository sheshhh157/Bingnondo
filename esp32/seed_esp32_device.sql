-- Run once in your bingnondo database (psql / pgAdmin) if the device row is missing.
-- First check what you already have:  SELECT * FROM esp32_devices;
-- If a row already exists, skip the insert and set ESP32_DEVICE_CODE in backend/.env
-- to its device_code instead.
INSERT INTO esp32_devices (device_code, location_label)
VALUES ('ESP32-KitchenA', 'Kitchen Counter A')
ON CONFLICT (device_code) DO NOTHING;
