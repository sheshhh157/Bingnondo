-- 006_staff_menu_categories.sql
--
-- Replace the staff-side menu categories with the shop's new set:
--
--   Rice Meals, Appetizers, Drinks (Caffeinated), Drinks (Non-Caffeinated),
--   Drinks (Student), Student Meal, Student Platter
--
-- Previous set was: Coffee, Hot Drinks, Iced Drinks, Pastries, Rice Meals
--
-- Existing menu_items are carried across rather than dropped, because
-- menu_items.category_id is ON DELETE NO ACTION - a category cannot be
-- deleted while items still point at it. So the order of operations matters:
-- create, move items, then remove the legacy categories that end up empty.
--
-- Re-runnable. Uses the UNIQUE(name) constraint to make creation idempotent,
-- and only deletes a legacy category once nothing references it.

BEGIN;

-- ─── 1. Create the new category set ──────────────────────────────────────────
INSERT INTO menu_categories (name) VALUES
  ('Rice Meals'),
  ('Appetizers'),
  ('Drinks (Caffeinated)'),
  ('Drinks (Non-Caffeinated)'),
  ('Drinks (Student)'),
  ('Student Meal'),
  ('Student Platter')
ON CONFLICT (name) DO NOTHING;

-- ─── 2. Carry existing items across ──────────────────────────────────────────
-- Coffee      -> Drinks (Caffeinated)      Cappuccino, Espresso
-- Iced Drinks -> Drinks (Caffeinated)      Iced Latte
-- Hot Drinks  -> Drinks (Non-Caffeinated)  Hot Chocolate
-- Pastries    -> Appetizers                Butter Croissant
-- Rice Meals  -> Rice Meals                already correct, left alone
UPDATE menu_items
   SET category_id = (SELECT id FROM menu_categories WHERE name = 'Drinks (Caffeinated)')
 WHERE category_id = (SELECT id FROM menu_categories WHERE name = 'Coffee');

UPDATE menu_items
   SET category_id = (SELECT id FROM menu_categories WHERE name = 'Drinks (Caffeinated)')
 WHERE category_id = (SELECT id FROM menu_categories WHERE name = 'Iced Drinks');

UPDATE menu_items
   SET category_id = (SELECT id FROM menu_categories WHERE name = 'Drinks (Non-Caffeinated)')
 WHERE category_id = (SELECT id FROM menu_categories WHERE name = 'Hot Drinks');

UPDATE menu_items
   SET category_id = (SELECT id FROM menu_categories WHERE name = 'Appetizers')
 WHERE category_id = (SELECT id FROM menu_categories WHERE name = 'Pastries');

-- ─── 3. Drop the legacy categories that are now empty ────────────────────────
-- The NOT EXISTS guard means an unexpected extra item cannot be orphaned;
-- the category simply stays behind for manual review instead.
DELETE FROM menu_categories
 WHERE name IN ('Coffee', 'Hot Drinks', 'Iced Drinks', 'Pastries')
   AND NOT EXISTS (
         SELECT 1 FROM menu_items m WHERE m.category_id = menu_categories.id
       );

COMMIT;