-- ============================================================
-- MIGRATION 021 — Recipe units for menu item ingredients
-- ============================================================
-- Why: an inventory item's stock is tracked in one unit (e.g. Milk in
-- liters), but a recipe commonly uses a smaller unit (e.g. 150 ml per
-- serving). Each link can now store the unit the recipe is written in plus
-- the factor that converts it into the ingredient's stock unit, so stock
-- deduction stays correct without forcing admins to do the math by hand.
--
-- Backward compatible: existing links keep unit = NULL and
-- conversion_factor = NULL, which deduction treats as "same unit" (factor 1).

BEGIN;

-- 1. menu_item_ingredients: recipe unit + conversion to the stock unit
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'menu_item_ingredients'
          AND column_name = 'unit'
    ) THEN
        ALTER TABLE public.menu_item_ingredients
            ADD COLUMN unit character varying(20);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'menu_item_ingredients'
          AND column_name = 'conversion_factor'
    ) THEN
        ALTER TABLE public.menu_item_ingredients
            ADD COLUMN conversion_factor numeric(14,6);
    END IF;
END $$;

COMMENT ON COLUMN public.menu_item_ingredients.unit IS
    'Unit the recipe amount is expressed in (e.g. ml). NULL = same as the inventory item stock unit.';
COMMENT ON COLUMN public.menu_item_ingredients.conversion_factor IS
    'Multiplier converting the recipe unit into the inventory stock unit (e.g. 1 ml = 0.001 liter). NULL = 1 (same unit).';

COMMIT;
