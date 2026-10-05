-- 017_staff_accounts_role_status_checks.sql
--
-- Pull the role/status check fixes that were hard-coded in
-- test-setup.js out of the bootstrap script and into the migration chain.
-- The canonical schema (bingnondo_database.sql) records an older, smaller
-- role list (no 'manager') and omits 'suspended' from the status list, so
-- seed data and the admin UI cannot create those accounts. Idempotent:
-- dropping and re-adding the constraints is safe.

ALTER TABLE staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_role_check;
ALTER TABLE staff_accounts ADD CONSTRAINT staff_accounts_role_check
  CHECK (role IN ('cashier','kitchen_staff','staff','owner','admin','manager'));

ALTER TABLE staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_status_check;
ALTER TABLE staff_accounts ADD CONSTRAINT staff_accounts_status_check
  CHECK (status IN ('active','deactivated','suspended'));
