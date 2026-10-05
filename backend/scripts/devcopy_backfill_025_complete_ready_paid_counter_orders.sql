-- One-off idempotent backfill: finish counter orders that are currently 'ready'
-- and already paid. Each gets one extra history row; then its status flips to
-- 'completed'. Running it again is a no-op because nothing is left in
-- (order_type='counter' AND status='ready' AND paid) after the first run.
--
-- NOTE: placed at backend/scripts/ (NOT backend/migrations/) so the dev
-- `npm run migrate` never auto-applies it to the real dev database.
BEGIN;

INSERT INTO order_status_history (order_id, status, changed_by)
SELECT o.id, 'completed', NULL
FROM orders o
WHERE o.order_type = 'counter'
  AND o.status = 'ready'
  AND EXISTS (
    SELECT 1 FROM payments p
    WHERE p.order_id = o.id AND p.status = 'paid'
  );

UPDATE orders
SET status = 'completed', updated_at = NOW()
WHERE order_type = 'counter'
  AND status = 'ready'
  AND EXISTS (
    SELECT 1 FROM payments p
    WHERE p.order_id = orders.id AND p.status = 'paid'
  );

COMMIT;
