# Database Changes — ESP32 Wi-Fi Provisioning

## New Table: `esp32_wifi_configs` (Migration `026`)

**File:** `backend/migrations/026_esp32_wifi_config.sql`

```sql
CREATE TABLE IF NOT EXISTS esp32_wifi_configs (
  device_id         integer PRIMARY KEY REFERENCES esp32_devices(id) ON DELETE CASCADE,
  ssid              text NOT NULL,
  password_ciphertext text NOT NULL,
  server_url        text NOT NULL,
  version           integer NOT NULL DEFAULT 1,
  updated_by        integer REFERENCES staff_accounts(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  applied_version   integer NOT NULL DEFAULT 0,
  applied_at        timestamptz,
  last_error        text
);
```

| Column | Type | Null | Default | Notes |
|--------|------|------|---------|-------|
| `device_id` | integer | NO | — | PK, FK → `esp32_devices.id`, cascade delete |
| `ssid` | text | NO | — | Wi-Fi network name |
| `password_ciphertext` | text | NO | — | AES-256-GCM encrypted (`v1:iv:tag:ct`) |
| `server_url` | text | NO | — | Backend URL, trailing slashes stripped |
| `version` | integer | NO | 1 | Config generation; incremented on save/resend |
| `updated_by` | integer | YES | — | FK → `staff_accounts.id`, set null on staff deletion |
| `updated_at` | timestamptz | NO | `now()` | Last admin write |
| `applied_version` | integer | NO | 0 | Version device last acknowledged |
| `applied_at` | timestamptz | YES | — | Timestamp of last successful device ACK |
| `last_error` | text | YES | — | Last failure reason from device ACK |

**Relationship:** One row per ESP32 device (1:1 with `esp32_devices.id`).

---

## Foundational Table: `esp32_devices` (Migration `008`)

**File:** `backend/migrations/008_esp32_devices.sql` (pre-existing, required by `026`)

Creates `esp32_devices` with `id`, `device_code`, `location_label`, `created_at`, `status`, `last_ping_at`. Seeds device `ESP32-KitchenA`. Adds FK `kitchen_alerts_device_id_fkey` → `esp32_devices(id)` and unique index on `device_code`.

---

## Related Tables Touched

| Table | Role |
|-------|------|
| `audit_log` | Every config save/resend/bulk writes a row: `target_type='esp32_wifi_configs'`, `target_id=<deviceId>`, `action='update_esp32_wifi_config'` / `'bulk_update_esp32_wifi_config'`, `details` = JSONB (`device_code`, `version`, `ssid`, `server_url`). |
| `staff_accounts` | `updated_by` FK references `id`; admin actor recorded on each write. |
| `kitchen_alerts` | Shares `esp32_devices` parent via FK; not modified by Wi-Fi feature. |

---

## SQL Operations by Route

| Route | Method | SQL |
|-------|--------|-----|
| `PUT .../esp32-devices/:code/wifi` | Admin save | `SELECT` device → `SELECT` existing config → `BEGIN` → `INSERT ... ON CONFLICT (device_id) DO UPDATE` (version+1) → `INSERT INTO audit_log` → `COMMIT` |
| `GET /api/esp32/config?device_code=&version=` | Device fetch | `SELECT ... FROM esp32_devices d LEFT JOIN esp32_wifi_configs c ... WHERE d.device_code = $1`; returns credentials only when `cfg.version > currentVersion` |
| `POST /api/esp32/config/ack` | Device ACK | `UPDATE esp32_wifi_configs c SET applied_version=..., applied_at=..., last_error=... FROM esp32_devices d WHERE c.device_id=d.id AND d.device_code=$1 AND c.version=$2::integer RETURNING c.device_id` |
| `PUT .../esp32-devices/:code/wifi/resend` | Admin resend | Same upsert as save with `version = old.version + 1`; audit action includes `'action':'resend'` |
| `GET .../esp32-devices/:code/history` | Admin history | `SELECT action, details, created_at FROM audit_log WHERE target_type='esp32_wifi_configs' AND target_id=$1 ORDER BY created_at DESC LIMIT 50` |
| `POST .../esp32-devices/:code/test-connection` | Admin test | No DB write; HTTP `fetch` to `<server_url>/api/esp32/alert?device_code=test-connection` |
| `PUT .../esp32-devices/wifi/bulk` | Admin bulk | Default targets `SELECT device_code FROM esp32_devices WHERE status='online'`; per-device same upsert + audit log (`action='bulk_update_esp32_wifi_config'`) |

---

## Apply Order

1. Run `backend/migrations/008_esp32_devices.sql`
2. Run `backend/migrations/026_esp32_wifi_config.sql`
3. Restart backend so route/controller changes load

No data migration needed — table starts empty (one row per device once an admin saves config).

---

## Indexes & Constraints

| Object | Type | Definition |
|--------|------|------------|
| `esp32_devices.id` | PK | `esp32_devices_pkey` |
| `esp32_devices.device_code` | Unique index | `idx_esp32_devices_device_code_unique` |
| `esp32_wifi_configs.device_id` | PK + FK | `PRIMARY KEY`, `REFERENCES esp32_devices(id) ON DELETE CASCADE` |
| `esp32_wifi_configs.updated_by` | FK | `REFERENCES staff_accounts(id) ON DELETE SET NULL` |
| `kitchen_alerts.device_id` | FK | `kitchen_alerts_device_id_fkey REFERENCES esp32_devices(id)` |

---

## Data Flow

```
Admin saves Wi-Fi config
  → esp32_wifi_configs (version N, encrypted password)
  → audit_log (action=update_esp32_wifi_config)
  → ESP32 polls GET /api/esp32/config?version=N-1
  → server returns credentials (version N > N-1)
  → ESP32 applies Wi-Fi, POST /api/esp32/config/ack {version:N, success:true}
  → esp32_wifi_configs.applied_version = N, applied_at = now(), last_error = NULL
```

If the device fails to apply: `applied_version` stays old, `last_error` records the failure, firmware persists `failedConfigVersion` with exponential backoff. Admin presses **Resend** (bumps version) or **Test connection** before saving again.
