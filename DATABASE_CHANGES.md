# Database Changes Log

Running log of **schema** changes made to the local PostgreSQL database for this
project — tables, columns, indexes and constraints only. Data seeding is
intentionally not logged here. Each schema change is shipped as a numbered,
idempotent migration in `backend/migrations/`.

Target database: `bingnondo_db` on PostgreSQL 16 (localhost:5432).

---

## 001 — Import base schema
- **Date:** 2026-10-13
- **Type:** Schema import
- **Source:** `bingnondo_database-schema.sql` (schema-only dump exported from PostgreSQL 18.6)
- **Applied:** Imported into a clean `bingnondo_db`.
- **Notes:**
  - PG18-only statements were stripped into a cleaned copy before import (the
    original dump was left untouched).
  - Result: 28 tables and 39 foreign keys.
  - Command: `psql -U postgres -h localhost -d bingnondo_db -f <cleaned-dump>.sql`

## 002 — Migration `008_esp32_devices.sql`
- **Date:** 2026-10-13
- **Type:** Schema
- **File:** `backend/migrations/008_esp32_devices.sql`
- **Why:** `GET /api/kitchen/alerts` LEFT JOINs `esp32_devices`, but the table was
  missing from the imported schema, causing PostgreSQL error `42P01`
  (relation "esp32_devices" does not exist).
- **Applied:**
  - Created sequence `esp32_devices_id_seq` and table `esp32_devices`.
  - Added primary key `esp32_devices_pkey`.
  - Added FK `kitchen_alerts_device_id_fkey` (`kitchen_alerts.device_id` → `esp32_devices.id`).
  - Added unique index `idx_esp32_devices_device_code_unique` on `device_code`.
