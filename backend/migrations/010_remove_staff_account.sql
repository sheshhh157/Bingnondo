-- ============================================================
-- MIGRATION 010 — Remove the legacy demo "staff" account
-- Run: psql $DATABASE_URL -f migrations/010_remove_staff_account.sql
--
-- Why: the standalone Staff Portal dashboard was removed. The `staff`
--      role is legacy — Admin only creates `cashier` / `kitchen_staff`
--      accounts — and the demo staff@bingnondo.com account has no rows
--      referencing it, so it is safe to delete.
--
-- Safe to run multiple times (no-op when the account is absent).
-- ============================================================

DELETE FROM staff_accounts WHERE email = 'staff@bingnondo.com';

-- ============================================================
-- END OF MIGRATION 010
-- ============================================================
