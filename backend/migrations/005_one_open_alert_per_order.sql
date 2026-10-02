-- 005_one_open_alert_per_order.sql
--
-- One unacknowledged kitchen alert per order, enforced.
--
-- After the fix in change #1, each paid order yields exactly one alert
-- (via payments.controller.js).  This partial unique index prevents any
-- code path from inserting a second unacknowledged alert for the same
-- order — turning a silent double-notification bug into a loud
-- constraint violation.
--
-- Applied only after verifying no order currently has more than one
-- unacknowledged alert, so this succeeds against the existing data.
-- (All existing alerts are already acknowledged, so the index creates
-- cleanly.)

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_alerts_one_open_per_order
  ON kitchen_alerts (order_id) WHERE acknowledged_at IS NULL;