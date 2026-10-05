-- 024_admin_switch_and_business_hours.sql
-- Additive: tables/columns the admin (switch-config + system-settings) module
-- expects but which no earlier migration created. Matches the exact column
-- names/upsert targets used in admin.controller.js and auth.switch.controller.js.

-- staff_accounts.created_by -> who created the account (nullable FK)
ALTER TABLE staff_accounts
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES staff_accounts(id) ON DELETE SET NULL;

-- Per-staff dashboard grants. Insert (staff_id, target_dashboard, granted_by);
-- granted_at defaults to now(). UNIQUE so a staff/dash pair is granted once.
CREATE TABLE IF NOT EXISTS staff_dashboard_access (
  id            SERIAL PRIMARY KEY,
  staff_id      INTEGER NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
  target_dashboard TEXT NOT NULL,
  granted_by    INTEGER REFERENCES staff_accounts(id) ON DELETE SET NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, target_dashboard)
);

-- Per-staff / per-dashboard switch-PIN requirements.
--   per_staff rows:    staff_id SET, target_dashboard NULL  -> upsert on staff_id
--   per_dashboard rows: staff_id NULL, target_dashboard SET -> upsert on target_dashboard
-- (UNIQUE allows multiple NULLs, so the two scopes don't interfere.)
CREATE TABLE IF NOT EXISTS dashboard_switch_config (
  id               SERIAL PRIMARY KEY,
  scope            TEXT NOT NULL CHECK (scope IN ('per_staff', 'per_dashboard')),
  staff_id         INTEGER REFERENCES staff_accounts(id) ON DELETE CASCADE,
  target_dashboard TEXT,
  requires_pin     BOOLEAN NOT NULL DEFAULT FALSE,
  configured_by    INTEGER REFERENCES staff_accounts(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id),
  UNIQUE (target_dashboard)
);

-- Staff's switch PIN (hashed). One row per staff -> upsert on staff_id.
CREATE TABLE IF NOT EXISTS staff_switch_pin (
  staff_id     INTEGER PRIMARY KEY REFERENCES staff_accounts(id) ON DELETE CASCADE,
  pin_hash     TEXT NOT NULL,
  set_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Business hours: one row per weekday (0=Sun .. 6=Sat), matching DAY_LABELS.
CREATE TABLE IF NOT EXISTS business_hours (
  id         SERIAL PRIMARY KEY,
  day_of_week INTEGER NOT NULL UNIQUE CHECK (day_of_week BETWEEN 0 AND 6),
  open_time  TIME,
  close_time TIME,
  is_closed  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by INTEGER REFERENCES staff_accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed 7 rows (default Mon-Fri 07:00-22:00, Fri to 23:00, Sun..Sat per mock).
INSERT INTO business_hours (day_of_week, open_time, close_time, is_closed) VALUES
  (0, '08:00', '21:00', FALSE),  -- Sunday
  (1, '07:00', '22:00', FALSE),  -- Monday
  (2, '07:00', '22:00', FALSE),  -- Tuesday
  (3, '07:00', '22:00', FALSE),  -- Wednesday
  (4, '07:00', '22:00', FALSE),  -- Thursday
  (5, '07:00', '23:00', FALSE),  -- Friday
  (6, '08:00', '23:00', FALSE)   -- Saturday
ON CONFLICT (day_of_week) DO NOTHING;
