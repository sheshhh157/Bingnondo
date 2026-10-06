-- ============================================================================
-- seed-demo-orders.sql  —  TEMPORARY, REVERSIBLE
--
-- Purpose: give the manager Sales Reports page enough data to judge its LAYOUT.
-- With only 14 real orders the charts render nearly empty, so bar widths, axis
-- label spacing and line density can't be assessed from a screenshot.
--
-- Runs against DEV only (`bingnondo`). `bingnondo_test` is never touched.
--
-- CLEANUP (exact, no guessing):
--   DELETE FROM orders WHERE special_request LIKE '[seed-verify]%';
-- Every seeded order carries the '[seed-verify]' marker, and order_items,
-- payments and order_status_history all cascade from orders. The 14 genuine
-- orders never carry that marker, so they are unaffected.
--
-- Shape of the data:
--   - 70 orders across the last 7 days  -> the 7-day revenue trend has 7 points
--   - hours drawn from 10:00-21:00, weighted to an evening peak at 17:00-19:00
--     -> the peak-hours bar chart shows a real curve, not a flat smear
--   - cash/gcash mix, 6 cancelled  -> both payment splits and the cancelled
--     counter render real values
--   - totals derived from actual menu_items prices, never invented
-- ============================================================================

BEGIN;

-- ── 1. Orders ───────────────────────────────────────────────────────────────
WITH plan AS (
  SELECT
    n,
    (CURRENT_DATE - (n % 7))::timestamptz
      + make_interval(
          hours => (ARRAY[11,12,13,10,14,16,17,18,19,20,21,15,17,18,19,16,12,13])[(n % 18) + 1],
          mins  => ((n * 7) % 60)
        ) AS created_at,
    (n % 11 = 0) AS is_cancelled
  FROM generate_series(1, 70) AS n
)
INSERT INTO orders (order_type, status, order_channel, total_amount, special_request, created_at, updated_at)
SELECT
  'counter',
  CASE WHEN is_cancelled THEN 'cancelled' ELSE 'completed' END,
  'web_counter',
  0,                                              -- corrected from line items below
  '[seed-verify] layout check #' || n,
  created_at,
  created_at
FROM plan;

-- ── 2. Line items ───────────────────────────────────────────────────────────
-- Item count derives from the order's real id (1 + id % 3), and the same
-- expression is reused in step 3 so totals always match the lines.
WITH pick AS (
  SELECT
    o.id AS order_id,
    g AS slot,
    (ARRAY[1,2,4,6,9,11,12,3,7,10])[((o.id * 3 + g * 5) % 10) + 1] AS menu_item_id,
    1 + ((o.id + g) % 2) AS qty
  FROM orders o
  CROSS JOIN generate_series(1, 3) AS g
  WHERE o.special_request LIKE '[seed-verify]%'
)
INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
SELECT p.order_id, p.menu_item_id, p.qty, mi.price
FROM pick p
JOIN menu_items mi ON mi.id = p.menu_item_id
WHERE p.slot <= (1 + (p.order_id % 3));

-- ── 3. Totals from the real line items ──────────────────────────────────────
UPDATE orders o
SET total_amount = sub.total
FROM (
  SELECT order_id, SUM(quantity * unit_price) AS total
  FROM order_items
  WHERE order_id IN (SELECT id FROM orders WHERE special_request LIKE '[seed-verify]%')
  GROUP BY order_id
) AS sub
WHERE o.id = sub.order_id;

-- ── 4. Payments (paid; skipped for cancelled orders) ───────────────────────
INSERT INTO payments (order_id, method, amount, status, paid_at, created_at)
SELECT
  o.id,
  (ARRAY['cash','gcash','gcash','cash'])[(o.id % 4) + 1],
  o.total_amount,
  'paid',
  o.created_at + interval '2 minutes',
  o.created_at + interval '2 minutes'
FROM orders o
WHERE o.special_request LIKE '[seed-verify]%'
  AND o.status = 'completed';

-- ── 5. Status history ───────────────────────────────────────────────────────
INSERT INTO order_status_history (order_id, status, created_at)
SELECT o.id, 'pending', o.created_at FROM orders o WHERE o.special_request LIKE '[seed-verify]%'
UNION ALL
SELECT o.id, 'confirmed', o.created_at + interval '1 minute' FROM orders o WHERE o.special_request LIKE '[seed-verify]%'
UNION ALL
SELECT o.id, 'preparing', o.created_at + interval '3 minutes' FROM orders o WHERE o.special_request LIKE '[seed-verify]%'
UNION ALL
SELECT o.id, 'ready',     o.created_at + interval '8 minutes' FROM orders o WHERE o.special_request LIKE '[seed-verify]%'
UNION ALL
SELECT o.id,
       CASE WHEN o.status = 'cancelled' THEN 'cancelled' ELSE 'completed' END,
       o.created_at + interval '12 minutes'
FROM orders o WHERE o.special_request LIKE '[seed-verify]%';

COMMIT;