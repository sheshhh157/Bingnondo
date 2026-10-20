-- ============================================================
-- MIGRATION 017 — Menu item variants
-- Run: psql $DATABASE_URL -f migrations/017_menu_item_variants.sql
--
-- Why: menu items can now be sold in flavors/sizes with their own absolute
--      price (e.g. "Halo-Halo Regular ₱75 / Large ₱95"). Variants are a flat
--      list per menu item; the base price is only used while an item has no
--      variants. Ingredients/recipes stay linked to the menu item itself, and
--      stock deducts per menu item, not per variant.
--
--      order_items stores the chosen variant (variant_id for reference,
--      variant_name as a snapshot so receipts/kitchen tickets keep showing
--      "Item – Variant" even if the variant is later deleted or renamed).
--
-- Safe to run multiple times (IF NOT EXISTS / guarded DO blocks).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS menu_item_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS menu_item_variants (
    id            integer      NOT NULL DEFAULT nextval('menu_item_variants_id_seq'::regclass),
    menu_item_id  integer      NOT NULL,
    name          character varying(100) NOT NULL,
    price         numeric(10,2) NOT NULL,
    is_available  boolean      NOT NULL DEFAULT true,
    display_order smallint     NOT NULL DEFAULT 0,
    created_at    timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER SEQUENCE menu_item_variants_id_seq OWNED BY menu_item_variants.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_variants_pkey'
    ) THEN
        ALTER TABLE menu_item_variants
            ADD CONSTRAINT menu_item_variants_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_variants_menu_item_id_fkey'
    ) THEN
        ALTER TABLE menu_item_variants
            ADD CONSTRAINT menu_item_variants_menu_item_id_fkey
            FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Variant names are unique per menu item (case-sensitive, matching how the
-- admin saves them).
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_item_variants_item_name
    ON menu_item_variants USING btree (menu_item_id, name);

CREATE INDEX IF NOT EXISTS idx_menu_item_variants_menu_item_id
    ON menu_item_variants USING btree (menu_item_id);

-- Chosen variant on an order line. variant_id is only a reference (variants
-- are hard-deleted when removed); variant_name is the receipt/kitchen
-- snapshot that must survive that delete.
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS variant_id integer;

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS variant_name character varying(100);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_variant_id_fkey'
    ) THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_variant_id_fkey
            FOREIGN KEY (variant_id) REFERENCES menu_item_variants(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- END OF MIGRATION 017
-- ============================================================
