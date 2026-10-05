-- 014_order_type_check.sql
--
-- Why a numbered migration here: the live database once had a different
-- orders_order_type_check CHECK list than bingnondo_database.sql carries, and
-- the fix was applied by hand. Numbering it means future databases get the
-- same shape from the migrations table rather than a paste command.
--
-- Idempotent: DROP ... IF EXISTS + a fresh ADD is a no-op semantically when
-- the constraint already carries the canonical list, and it produces the same
-- type (text, canonical order in the ARRAY form) on every run. The text of the
-- ADD is pinned to bingnondo_database.sql's CREATE TABLE.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('online', 'counter'));
