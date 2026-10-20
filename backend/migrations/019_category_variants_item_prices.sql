-- ============================================================
-- MIGRATION 019 — Category variant groups + per-item variant prices
-- ============================================================

BEGIN;

-- 1. Drop price column from variant_group_options
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'variant_group_options'
          AND column_name = 'price'
    ) THEN
        ALTER TABLE public.variant_group_options DROP COLUMN price;
    END IF;
END $$;

-- 2. menu_category_variant_groups
CREATE TABLE IF NOT EXISTS public.menu_category_variant_groups (
    category_id      INTEGER NOT NULL,
    variant_group_id INTEGER NOT NULL,
    PRIMARY KEY (category_id, variant_group_id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='menu_category_variant_groups_category_id_fkey') THEN
        ALTER TABLE public.menu_category_variant_groups
            ADD CONSTRAINT menu_category_variant_groups_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='menu_category_variant_groups_variant_group_id_fkey') THEN
        ALTER TABLE public.menu_category_variant_groups
            ADD CONSTRAINT menu_category_variant_groups_variant_group_id_fkey
            FOREIGN KEY (variant_group_id) REFERENCES public.variant_groups(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_category_variant_groups_category_id ON public.menu_category_variant_groups(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_category_variant_groups_variant_group_id ON public.menu_category_variant_groups(variant_group_id);

-- 3. menu_item_variants extensions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='menu_item_variants' AND column_name='variant_group_id') THEN
        ALTER TABLE public.menu_item_variants ADD COLUMN variant_group_id INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='menu_item_variants' AND column_name='variant_group_option_id') THEN
        ALTER TABLE public.menu_item_variants ADD COLUMN variant_group_option_id INTEGER;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='menu_item_variants_variant_group_id_fkey') THEN
        ALTER TABLE public.menu_item_variants
            ADD CONSTRAINT menu_item_variants_variant_group_id_fkey
            FOREIGN KEY (variant_group_id) REFERENCES public.variant_groups(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='menu_item_variants_variant_group_option_id_fkey') THEN
        ALTER TABLE public.menu_item_variants
            ADD CONSTRAINT menu_item_variants_variant_group_option_id_fkey
            FOREIGN KEY (variant_group_option_id) REFERENCES public.variant_group_options(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_item_variants_menu_item_group ON public.menu_item_variants(menu_item_id, variant_group_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_group_option ON public.menu_item_variants(variant_group_option_id);
-- ensure existing index on menu_item_id present (may already exist)
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_menu_item_id ON public.menu_item_variants(menu_item_id);

-- 4. Uniques
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_menu_item_variants_item_name') THEN
        DROP INDEX public.uq_menu_item_variants_item_name;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_menu_item_variants_item_name' AND conrelid='public.menu_item_variants'::regclass) THEN
        ALTER TABLE public.menu_item_variants DROP CONSTRAINT uq_menu_item_variants_item_name;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_item_variants_item_group_option
    ON public.menu_item_variants(menu_item_id, variant_group_option_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_item_variants_item_name_legacy
    ON public.menu_item_variants(menu_item_id, name)
    WHERE variant_group_id IS NULL;

DO $$
BEGIN
    ALTER TABLE public.menu_item_variants ALTER COLUMN price SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

COMMIT;
