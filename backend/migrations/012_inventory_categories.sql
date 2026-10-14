-- ============================================================
-- MIGRATION 012 — Inventory categories
-- Run: psql $DATABASE_URL -f migrations/012_inventory_categories.sql
--
-- Why: the Inventory page gains a managed category list. Inventory
--      ingredients (inventory_items) previously had no category column, so
--      this adds an `inventory_categories` table plus a nullable
--      `inventory_items.category_id` foreign key. Menu categories
--      (menu_categories) are a separate, unrelated system.
--
-- Safe to run multiple times (IF NOT EXISTS / guarded DO blocks).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS inventory_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS inventory_categories (
    id         integer      NOT NULL DEFAULT nextval('inventory_categories_id_seq'::regclass),
    name       character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER SEQUENCE inventory_categories_id_seq OWNED BY inventory_categories.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_categories_pkey'
    ) THEN
        ALTER TABLE inventory_categories
            ADD CONSTRAINT inventory_categories_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- Case-insensitive uniqueness on the category name.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_categories_name
    ON inventory_categories USING btree (LOWER(name));

-- Nullable FK on inventory_items. ON DELETE SET NULL is a safety net; the
-- API also refuses to delete a category that is still in use.
ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS category_id integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_category_id_fkey'
    ) THEN
        ALTER TABLE inventory_items
            ADD CONSTRAINT inventory_items_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_items_category_id
    ON inventory_items USING btree (category_id);

-- ============================================================
-- END OF MIGRATION 012
-- ============================================================
