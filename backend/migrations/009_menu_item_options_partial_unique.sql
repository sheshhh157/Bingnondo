-- 009_menu_item_options_partial_unique.sql
--
-- WHY: migration 008 created menu_item_options with a table-level
--   UNIQUE (menu_item_id, name). That constraint also covers ARCHIVED rows, so
--   the normal staff workflow of switching a drink's Hot/Iced toggle off and
--   back on again tried to INSERT a second "Hot" and died on
--   duplicate key value violates unique constraint
--   "menu_item_options_menu_item_id_name_key" -- a bare 500, and the toggle
--   looked permanently stuck once used.
--
-- The fix is to scope uniqueness to live rows only. Archiving frees the name
-- for reuse while the archived row stays in place, so order_items rows that
-- point at it keep resolving the variant name on an old receipt.
--
-- 008 has been corrected in source too, so a fresh install gets this from the
-- partial index directly. This migration exists for databases that already
-- applied the original 008. Both steps are idempotent and safe to re-run.

-- 1. Drop the old table-level UNIQUE, if this database still has it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'menu_item_options'
      AND c.conname = 'menu_item_options_menu_item_id_name_key'
      AND c.contype = 'u'
  ) THEN
    ALTER TABLE menu_item_options
      DROP CONSTRAINT menu_item_options_menu_item_id_name_key;
    RAISE NOTICE 'dropped table-level UNIQUE on menu_item_options';
  END IF;
END $$;

-- 2. Enforce one live row per (menu_item_id, name) instead.
--    Cannot fail: the old UNIQUE already guaranteed no duplicates at all.
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_item_options_active_name
  ON menu_item_options (menu_item_id, name)
  WHERE archived_at IS NULL;

COMMENT ON INDEX idx_menu_item_options_active_name IS
  'One live variant per name per item. Archived rows are excluded so a name '
  'can be reused after a toggle-off, without losing the row that old orders '
  'still reference.';