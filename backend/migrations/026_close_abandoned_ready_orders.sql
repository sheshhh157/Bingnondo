-- 026_close_abandoned_ready_orders.sql
--
-- WHY
-- ---
-- A counter order that the kitchen marks ready is completed in the same
-- transaction (kitchen.controller.js: order_type 'counter' + 'ready' also writes
-- 'completed'). So a *counter* ticket still sitting at 'ready' can only mean
-- the handoff never happened.
--
-- Nothing in the app can clear one afterwards:
--   * the status machine allows only `ready -> out_for_delivery | completed`
--     (status-transitions.js), and
--   * the kitchen endpoint cannot re-fire, because an order that is already
--     'ready' can no longer move to 'ready'.
-- It is therefore a permanent dead end for the order, not a pending task.
--
-- On the dev database 36 such orders had piled up over 12 days
-- (2026-09-23 .. 2026-10-04), none of them paid. Because the dashboard counts
-- `status = 'ready'` as "N orders are ready for pickup - hand it over", they
-- were surfaced as live work and the number only ever grew.
--
-- WHAT IT DOES
-- ------------
-- Closes abandoned counter handoffs out as 'cancelled' and records the move in
-- the status history, so the audit trail still explains how each row ended up
-- there.
--
-- 'cancelled' rather than 'completed' is deliberate: these orders were never
-- handed over and never paid, and marking them 'completed' would fabricate a
-- handoff that did not happen (and would inflate the completed-order counts).
-- This is a one-off repair of rows the application could not clean up itself,
-- not a change to the transition rules — the app still refuses to cancel an
-- order once the kitchen has started cooking.
--
-- SAFETY
-- ------
-- Narrow on purpose. A row is only touched when ALL of these hold:
--   * status = 'ready'                      -- it is a stuck handoff
--   * order_type = 'counter'                -- online orders legitimately wait
--                                            at 'ready' for a rider
--   * updated_at older than 24 hours        -- matches HANDOFF_STALE_HOURS in
--                                            the manager UI, so the two agree
--   * no paid payment row exists            -- never voids money that came in
--
-- Re-running is a no-op: once closed, the rows no longer match the predicate.
-- Nothing here touches revenue, which is driven by payments.status = 'paid'.
--
-- Verify the blast radius before running:
--   SELECT count(*) FROM orders o
--   WHERE o.status = 'ready' AND o.order_type = 'counter'
--     AND o.updated_at < NOW() - INTERVAL '24 hours'
--     AND NOT EXISTS (SELECT 1 FROM payments p
--                     WHERE p.order_id = o.id AND p.status = 'paid');

BEGIN;

-- FOR UPDATE locks the matched rows so a concurrent status change cannot slip
-- between the predicate and the UPDATE.
WITH abandoned AS (
  SELECT o.id
  FROM orders o
  WHERE o.status = 'ready'
    AND o.order_type = 'counter'
    AND o.updated_at < NOW() - INTERVAL '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM payments p
      WHERE p.order_id = o.id AND p.status = 'paid'
    )
  FOR UPDATE
),
-- Audit first: the history row explains the status the order is being given.
audited AS (
  INSERT INTO order_status_history (order_id, status, changed_by)
  SELECT id, 'cancelled', NULL FROM abandoned
  RETURNING order_id
)
UPDATE orders o
SET status = 'cancelled', updated_at = NOW()
FROM audited a
WHERE o.id = a.order_id;

COMMIT;