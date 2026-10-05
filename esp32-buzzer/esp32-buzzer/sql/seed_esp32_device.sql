-- Run once in your bingnondo database (psql / pgAdmin).
-- First check what you already have:  SELECT * FROM esp32_devices;
-- If a row already exists, skip the insert and set ESP32_DEVICE_CODE in .env to its device_code.
INSERT INTO esp32_devices (device_code, location_label)
VALUES ('ESP32-KitchenA', 'Main Kitchen')
ON CONFLICT (device_code) DO NOTHING;
