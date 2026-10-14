-- ============================================================
-- MIGRATION 014 — Inventory items can have multiple categories
-- Run: psql $DATABASE_URL -f migrations/014_inventory_item_categories.sql
--
-- Why: an ingredient may belong to more than one menu category. The single
--      inventory_items.category_id column is replaced by a junction table
--      (many-to-many with menu_categories). The shared menu_categories list
--      stays the single source of truth.
--
-- Safe to run multiple times (guards on every step).
-- ============================================================

-- 1. Junction table.
CREATE TABLE IF NOT EXISTS inventory_item_categories (
    inventory_item_id integer NOT NULL,
    category_id       integer NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_categories_pkey'
    ) THEN
        ALTER TABLE inventory_item_categories
            ADD CONSTRAINT inventory_item_categories_pkey
            PRIMARY KEY (inventory_item_id, category_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_categories_item_id_fkey'
    ) THEN
        ALTER TABLE inventory_item_categories
            ADD CONSTRAINT inventory_item_categories_item_id_fkey
            FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_item_categories_category_id_fkey'
    ) THEN
        ALTER TABLE inventory_item_categories
            ADD CONSTRAINT inventory_item_categories_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_item_categories_category_id
    ON inventory_item_categories USING btree (category_id);

-- 2. Carry over any existing single-category assignments (only if the old
--    column still exists).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inventory_items'
          AND column_name = 'category_id'
    ) THEN
        INSERT INTO inventory_item_categories (inventory_item_id, category_id)
        SELECT i.id, i.category_id
        FROM inventory_items i
        JOIN menu_categories mc ON mc.id = i.category_id
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 3. Drop the now-unused single-category column and its FK / index.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_menu_category_id_fkey'
    ) THEN
        ALTER TABLE inventory_items DROP CONSTRAINT inventory_items_menu_category_id_fkey;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_inventory_items_category_id;

ALTER TABLE inventory_items DROP COLUMN IF EXISTS category_id;

-- ============================================================
-- END OF MIGRATION 014
-- ============================================================
