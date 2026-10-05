-- 023_partial_unique_idx_deductions_only.sql
-- Replace the broad unique index on (reference_order_id, inventory_item_id)
-- with one that only applies to 'deduction' rows.
DROP INDEX IF EXISTS idx_inventory_txns_order_item;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_txns_order_item
  ON inventory_transactions(reference_order_id, inventory_item_id)
  WHERE change_type = 'deduction' AND reference_order_id IS NOT NULL;
