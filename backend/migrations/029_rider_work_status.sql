-- Migration 029: Add daily work status to riders
-- Tracks whether a rider has chosen to work today.
-- Resets every day at 12:00 AM (checked by the backend, not via a cron).
--
-- work_status:
--   NULL        = not yet answered today (prompt will show)
--   'working'   = rider chose to work today (can receive orders)
--   'off'       = rider chose not to work today (no orders)
--
-- work_status_set_at:
--   Timestamp when the rider last answered the daily prompt.
--   Used to decide whether the prompt should show again (new day check).
--
-- admin_work_override:
--   NULL        = no admin override active
--   'working'   = admin forced rider online for the day
--   'off'       = admin forced rider offline for the day
--   Cleared automatically on next 12:00 AM reset (same as work_status).
--
-- admin_work_override_at:
--   When the admin set the override.

ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS work_status           VARCHAR(10)  DEFAULT NULL
    CONSTRAINT riders_work_status_check
      CHECK (work_status IS NULL OR work_status IN ('working', 'off')),
  ADD COLUMN IF NOT EXISTS work_status_set_at    TIMESTAMP    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_work_override   VARCHAR(10)  DEFAULT NULL
    CONSTRAINT riders_admin_work_override_check
      CHECK (admin_work_override IS NULL OR admin_work_override IN ('working', 'off')),
  ADD COLUMN IF NOT EXISTS admin_work_override_at TIMESTAMP   DEFAULT NULL;

-- Index for quick lookup in assignment logic
CREATE INDEX IF NOT EXISTS idx_riders_work_status ON public.riders (work_status);
