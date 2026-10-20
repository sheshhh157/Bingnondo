-- ============================================================
-- MIGRATION 020 — Variant groups: name + max options only
-- ============================================================
-- A variant group becomes a pure template: a name and the maximum
-- number of options a menu item may define for it. Option names and
-- prices are entered per menu item (menu_item_variants). The global
-- variant_group_options table is dropped and menu_item_variants no
-- longer references a global option.
-- ============================================================

BEGIN;

-- 1. Add max_options to variant_groups
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'variant_groups'
          AND column_name = 'max_options'
    ) THEN
        ALTER TABLE public.variant_groups ADD COLUMN max_options integer NOT NULL DEFAULT 3;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_variant_groups_max_options') THEN
        ALTER TABLE public.variant_groups
            ADD CONSTRAINT chk_variant_groups_max_options CHECK (max_options BETWEEN 1 AND 10);
    END IF;
END $$;

-- 2. Drop the option-linked column, its FK, indexes and uniques
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_variants_variant_group_option_id_fkey') THEN
        ALTER TABLE public.menu_item_variants
            DROP CONSTRAINT menu_item_variants_variant_group_option_id_fkey;
    END IF;
END $$;

DROP INDEX IF EXISTS public.uq_menu_item_variants_item_group_option;
DROP INDEX IF EXISTS public.idx_menu_item_variants_group_option;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'menu_item_variants'
          AND column_name = 'variant_group_option_id'
    ) THEN
        ALTER TABLE public.menu_item_variants DROP COLUMN variant_group_option_id;
    END IF;
END $$;

-- 3. Drop the now-unused global options table (and its sequence)
DROP TABLE IF EXISTS public.variant_group_options;

-- 4. Uniqueness: option names are unique per group per item
CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_item_variants_item_group_name
    ON public.menu_item_variants(menu_item_id, variant_group_id, LOWER(name))
    WHERE variant_group_id IS NOT NULL;

COMMIT;
