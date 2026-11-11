-- Migration 027: Split full_name into first_name, middle_name, last_name
-- for both staff_accounts and riders tables.
--
-- Strategy:
--   1. Add the three new columns (nullable to allow backfill first).
--   2. Backfill from existing full_name data:
--        first word  → first_name
--        last word   → last_name  (same as first when only one word)
--        everything between → middle_name (NULL when only 2 words)
--   3. Set first_name / last_name NOT NULL (middle_name stays nullable).
--   4. Drop the old full_name column.
--   5. Re-add full_name as a GENERATED ALWAYS column so existing queries
--      that SELECT full_name keep working without any code change.
--
-- The generated expression trims each part and skips the middle name when
-- it is NULL, so the result is always "First Last" or "First Middle Last".

-- ── staff_accounts ────────────────────────────────────────────────────────────

ALTER TABLE staff_accounts
  ADD COLUMN IF NOT EXISTS first_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name   VARCHAR(100);

-- Backfill: split stored full_name into parts.
UPDATE staff_accounts
SET
  first_name  = split_part(trim(full_name), ' ', 1),
  last_name   = CASE
                  WHEN array_length(string_to_array(trim(full_name), ' '), 1) >= 2
                  THEN (string_to_array(trim(full_name), ' '))[array_length(string_to_array(trim(full_name), ' '), 1)]
                  ELSE split_part(trim(full_name), ' ', 1)
                END,
  middle_name = CASE
                  WHEN array_length(string_to_array(trim(full_name), ' '), 1) >= 3
                  THEN trim(
                    regexp_replace(
                      trim(full_name),
                      '^(\S+)\s+(.*)\s+(\S+)$',
                      '\2'
                    )
                  )
                  ELSE NULL
                END
WHERE first_name IS NULL;

-- Enforce NOT NULL on required parts.
ALTER TABLE staff_accounts
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name  SET NOT NULL;

-- Drop old plain column and re-add as generated.
ALTER TABLE staff_accounts DROP COLUMN full_name;

ALTER TABLE staff_accounts
  ADD COLUMN full_name VARCHAR(300)
    GENERATED ALWAYS AS (
      trim(first_name) || ' ' ||
      COALESCE(trim(middle_name) || ' ', '') ||
      trim(last_name)
    ) STORED;

-- ── riders ────────────────────────────────────────────────────────────────────

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS first_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name   VARCHAR(100);

UPDATE riders
SET
  first_name  = split_part(trim(full_name), ' ', 1),
  last_name   = CASE
                  WHEN array_length(string_to_array(trim(full_name), ' '), 1) >= 2
                  THEN (string_to_array(trim(full_name), ' '))[array_length(string_to_array(trim(full_name), ' '), 1)]
                  ELSE split_part(trim(full_name), ' ', 1)
                END,
  middle_name = CASE
                  WHEN array_length(string_to_array(trim(full_name), ' '), 1) >= 3
                  THEN trim(
                    regexp_replace(
                      trim(full_name),
                      '^(\S+)\s+(.*)\s+(\S+)$',
                      '\2'
                    )
                  )
                  ELSE NULL
                END
WHERE first_name IS NULL;

ALTER TABLE riders
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name  SET NOT NULL;

ALTER TABLE riders DROP COLUMN full_name;

ALTER TABLE riders
  ADD COLUMN full_name VARCHAR(300)
    GENERATED ALWAYS AS (
      trim(first_name) || ' ' ||
      COALESCE(trim(middle_name) || ' ', '') ||
      trim(last_name)
    ) STORED;
