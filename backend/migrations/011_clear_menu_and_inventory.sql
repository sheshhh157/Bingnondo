-- ============================================================================
-- 011_clear_menu_and_inventory.sql
--
-- Empties ALL menu and inventory data, together with the demo orders and
-- transactions that reference them, so the store can add its own menu items
-- and stock. Idempotent - safe to run more than once.
--
-- Tables cleared:
--   menu_categories, menu_items, menu_item_ingredients, inventory_items
-- Dependent rows cleared (required to satisfy FK constraints):
--   order_items, inventory_transactions, orders
--   (payments, deliveries, kitchen_alerts, order_status_history cascade from
--    orders; support_chat_messages are detached, not deleted)
-- ============================================================================

BEGIN;

-- 1. Detach support-chat messages from demo orders (FK is NO ACTION)
UPDATE support_chat_messages
   SET related_order_id = NULL
 WHERE related_order_id IS NOT NULL;

-- 2. Rows that reference orders / inventory items
DELETE FROM customer_order_violations;
DELETE FROM inventory_transactions;

-- 3. Demo orders (cascades to order_items, payments, deliveries,
--    kitchen_alerts and order_status_history)
DELETE FROM orders;

-- 4. Menu + inventory
DELETE FROM menu_item_ingredients;
DELETE FROM menu_items;
DELETE FROM menu_categories;
DELETE FROM inventory_items;

COMMIT;
