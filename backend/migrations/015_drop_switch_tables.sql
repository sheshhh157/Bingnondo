-- ============================================================
-- MIGRATION 015 — Drop the dashboard-switch tables
-- Run: psql $DATABASE_URL -f migrations/015_drop_switch_tables.sql
--
-- Why: the "switch into another dashboard" feature (granted via
--      staff_dashboard_access, gated by staff_switch_pin, configured by
--      dashboard_switch_config) has been removed from the app. No endpoint
--      reads or writes these tables any more, so they are dropped to stop
--      the schema from drifting. Each table's own FKs/sequences/indexes
--      come away with it via CASCADE.
--
-- Safe to run multiple times (IF EXISTS).
-- ============================================================

DROP TABLE IF EXISTS dashboard_switch_config CASCADE;
DROP TABLE IF EXISTS staff_dashboard_access  CASCADE;
DROP TABLE IF EXISTS staff_switch_pin        CASCADE;

-- ============================================================
-- END OF MIGRATION 015
-- ============================================================
