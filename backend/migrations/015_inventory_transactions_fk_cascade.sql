-- 015_inventory_transactions_fk_cascade.sql
--
-- Aligns the stock-movement FK with the rest of the delete-cascade families
-- (menu_item_ingredients, order_items, kitchen_alerts already cascade) and
-- with the live database, where this constraint was altered by hand. Without
-- it, deleting an ingredient is blocked by its own movement history even
-- though inventory_delete.test.js expects the history to cascade. Idempotent:
-- the DROP uses IF EXISTS and the ADD re-creates the same definition.

ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_inventory_item_id_fkey;

ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id)
  REFERENCES inventory_items(id) ON DELETE CASCADE;
