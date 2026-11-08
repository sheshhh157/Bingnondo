CREATE TABLE IF NOT EXISTS esp32_wifi_configs (
  device_id integer PRIMARY KEY REFERENCES esp32_devices(id) ON DELETE CASCADE,
  ssid text NOT NULL,
  password_ciphertext text NOT NULL,
  server_url text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by integer REFERENCES staff_accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_version integer NOT NULL DEFAULT 0,
  applied_at timestamptz,
  last_error text
);