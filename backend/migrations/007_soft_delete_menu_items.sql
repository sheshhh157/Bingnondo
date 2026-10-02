-- 007_soft_delete_menu_items.sql
--
-- Allow a menu item to be removed from the menu even when past orders
-- reference it.
--
-- The problem: `order_items.menu_item_id` is NOT NULL with no ON DELETE
-- clause, so it defaults to NO ACTION. `order_items` also has NO name
-- snapshot — only quantity and unit_price. A hard DELETE of a menu item that
-- has been ordered therefore fails with FK violation 23503, which the
-- handler passed straight to next(err), surfacing as a bare HTTP 500.
--
-- That made every real menu item un-deletable: all six had order history.
--
-- Why not ON DELETE SET NULL? It would satisfy the FK but leave order_items
-- pointing at nothing with no name to fall back on, so receipts and any
-- order-item lookup would render blank. Losing the menu item's name from a
-- real sale is worse than keeping a hidden row.
--
-- So: archive instead of delete. The row survives so history keeps resolving,
-- and menu listings filter it out.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN menu_items.archived_at IS
  'Set when the item is removed from the menu. The row is kept because '
  'order_items reference it and store no name snapshot.';