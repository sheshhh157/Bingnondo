-- 016_inventory_transactions_fk_restrict.sql
--
-- Prevents inventory_items from being deleted while they still have
-- movement history in inventory_transactions. The previous FK (migration 015)
-- used ON DELETE CASCADE, which silently erased the audit trail.
--
-- Idempotent: DROP IF EXISTS removes the constraint from both old and new
-- schemas, then we re-create it with RESTRICT.

ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_inventory_item_id_fkey;

ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id)
  REFERENCES inventory_items(id) ON DELETE RESTRICT;
