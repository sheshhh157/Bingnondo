-- ============================================================
-- MIGRATION 013 — Inventory uses menu categories
-- Run: psql $DATABASE_URL -f migrations/013_inventory_menu_categories.sql
--
-- Why: inventory no longer keeps its own category list. Ingredients now
--      reference the existing menu_categories (managed in Menu Management),
--      so the temporary inventory_categories table is removed and the
--      inventory_items.category_id foreign key is repointed.
--
-- Safe to run multiple times (guards on every step).
-- ============================================================

-- 1. Carry over any categories that were created under the old
--    inventory_categories table by matching them to menu_categories by name.
--    (No-op if inventory_categories is already gone.)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM to_regclass('public.inventory_categories')) THEN
        UPDATE inventory_items i
        SET category_id = mc.id
        FROM inventory_categories ic
        JOIN menu_categories mc ON LOWER(mc.name) = LOWER(ic.name)
        WHERE i.category_id = ic.id;
    END IF;
END $$;

-- 2. Null out any category_id that does not resolve to a real menu category,
--    so the new foreign key can be created cleanly.
UPDATE inventory_items i
SET category_id = NULL
WHERE i.category_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM menu_categories mc WHERE mc.id = i.category_id);

-- 3. Drop the old FK to inventory_categories.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_category_id_fkey') THEN
        ALTER TABLE inventory_items DROP CONSTRAINT inventory_items_category_id_fkey;
    END IF;
END $$;

-- 4. Add the new FK to menu_categories.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_menu_category_id_fkey') THEN
        ALTER TABLE inventory_items
            ADD CONSTRAINT inventory_items_menu_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Remove the temporary inventory category table + sequence.
DROP TABLE IF EXISTS inventory_categories;
DROP SEQUENCE IF EXISTS inventory_categories_id_seq;

-- ============================================================
-- END OF MIGRATION 013
-- ============================================================
