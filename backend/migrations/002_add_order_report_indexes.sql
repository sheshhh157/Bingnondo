-- 002_add_order_report_indexes.sql
--
-- Foreign-key indexes for the manager sales report.
--
-- `order_items` and `payments` each have only a primary key on `id`, so the
-- planner has no way to find the children of a given order except by scanning
-- the whole table. `GET /api/orders` already inner-joins both, and the new
-- report endpoint joins them on every aggregate — revenue, best sellers, the
-- item-name search — so all of those hash-join over a sequential scan today.
--
-- Harmless at the current row count (7 orders / 14 items / 7 payments). These
-- exist so the report stays fast as the history grows.
--
-- `orders` is already covered by `idx_orders_created (created_at DESC)`, which
-- serves the report's date-range scan, so nothing is added there.
--
-- NOTE: plain CREATE INDEX takes a write lock that blocks inserts for the
-- duration. That is instant at this size. If this is ever re-run against a
-- large live table, use CREATE INDEX CONCURRENTLY instead — but note
-- CONCURRENTLY cannot run inside a transaction, so it must not be wrapped.

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id     ON payments (order_id);
