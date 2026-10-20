-- ============================================================
-- MIGRATION 018 — Variant groups (reusable variant definitions)
-- Run: psql $DATABASE_URL -f migrations/018_variant_groups.sql
--
-- Why: variants like Flavor / Solo-Sharing / Hot-Cold are defined once in
--      System Settings — a named group with its priced options (e.g. Flavor:
--      Chocolate ₱99, Vanilla ₱99) — instead of retyping the same list on
--      every menu item. menu_item_variants stays the per-item runtime table
--      the cashier and ordering flow read; attaching a group's options to
--      items comes later and will write into that table.
--
-- Safe to run multiple times (IF NOT EXISTS / guarded DO blocks).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS variant_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS variant_groups (
    id         integer      NOT NULL DEFAULT nextval('variant_groups_id_seq'::regclass),
    name       character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER SEQUENCE variant_groups_id_seq OWNED BY variant_groups.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'variant_groups_pkey'
    ) THEN
        ALTER TABLE variant_groups
            ADD CONSTRAINT variant_groups_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- Group names are unique case-insensitively ("Flavor" = "flavor").
CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_groups_name
    ON variant_groups USING btree (LOWER(name));

CREATE SEQUENCE IF NOT EXISTS variant_group_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS variant_group_options (
    id            integer      NOT NULL DEFAULT nextval('variant_group_options_id_seq'::regclass),
    group_id      integer      NOT NULL,
    name          character varying(100) NOT NULL,
    price         numeric(10,2) NOT NULL,
    display_order smallint     NOT NULL DEFAULT 0,
    created_at    timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

ALTER SEQUENCE variant_group_options_id_seq OWNED BY variant_group_options.id;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'variant_group_options_pkey'
    ) THEN
        ALTER TABLE variant_group_options
            ADD CONSTRAINT variant_group_options_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'variant_group_options_group_id_fkey'
    ) THEN
        ALTER TABLE variant_group_options
            ADD CONSTRAINT variant_group_options_group_id_fkey
            FOREIGN KEY (group_id) REFERENCES variant_groups(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Option names are unique per group, case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_group_options_group_name
    ON variant_group_options USING btree (group_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_variant_group_options_group_id
    ON variant_group_options USING btree (group_id);

-- ============================================================
-- END OF MIGRATION 018
-- ============================================================
