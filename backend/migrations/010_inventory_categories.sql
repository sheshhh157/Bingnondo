-- 010_inventory_categories.sql
--
-- Let inventory ingredients carry the same categories the menu uses, and carry
-- more than one at a time.
--
-- Reuses menu_categories rather than adding a second category table: the shop
-- has one set of categories (Rice Meals, Appetizers, Drinks (Caffeinated),
-- Drinks (Non-Caffeinated), Drinks (Student), Student Meal, Student Platter)
-- and an ingredient list that has nothing to gain from a parallel vocabulary.
--
-- Why a join table instead of a category_id column: an ingredient really can
-- belong to several categories at once. Chicken Siomai is used by both a Student
-- Meal and a Student Platter item, so the staff picking it in inventory want to
-- find it under either heading. A single column would force them to choose one
-- and hide it from the other list.
--
-- ON DELETE CASCADE on both sides, matching menu_item_ingredients. Dropping an
-- ingredient already erases its recipe links and movement history, so quietly
-- detaching a category tag costs nothing by comparison. The API guards the
-- menu_categories side instead: DELETE /api/menu/categories/:id refuses to drop
-- a category that ingredients still point at, the same way it already refuses
-- one that menu items point at.
--
-- Indexed on menu_category_id alone, because the only question ever asked of
-- this table is "which ingredients are in this category" - the inventory filter.
-- The composite primary key already covers the reverse lookup.
--
-- Re-runnable. The backfill and the column drop are wrapped in a guard so this
-- runs correctly both on a database that still has the old single category_id
-- column and on one that never had it.

BEGIN;

CREATE TABLE IF NOT EXISTS inventory_item_categories (
  inventory_item_id integer NOT NULL
    REFERENCES inventory_items(id) ON DELETE CASCADE,
  menu_category_id  integer NOT NULL
    REFERENCES menu_categories(id)  ON DELETE CASCADE,
  PRIMARY KEY (inventory_item_id, menu_category_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_categories_category
  ON inventory_item_categories (menu_category_id);

-- Carry across anything tagged under the earlier single-column design, then
-- retire that column. ON CONFLICT DO NOTHING keeps a re-run from tripping over
-- links that are already present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'inventory_items'
       AND column_name  = 'category_id'
  ) THEN
    INSERT INTO inventory_item_categories (inventory_item_id, menu_category_id)
    SELECT id, category_id
      FROM inventory_items
     WHERE category_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    -- Dropping the column also drops idx_inventory_items_category_id with it.
    ALTER TABLE inventory_items DROP COLUMN category_id;
  END IF;
END $$;

COMMIT;