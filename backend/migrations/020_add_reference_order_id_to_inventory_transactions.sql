-- 020_add_reference_order_id_to_inventory_transactions.sql
-- Add reference_order_id and a partial unique index for sale deductions.
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS reference_order_id integer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_txns_order_item
  ON inventory_transactions(reference_order_id, inventory_item_id)
  WHERE reference_order_id IS NOT NULL;
