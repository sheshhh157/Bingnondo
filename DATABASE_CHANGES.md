# Database Changes Log

Running log of **schema** changes for this project — tables, columns, indexes
and constraints only. Data seeding is intentionally not logged here. Each
schema change ships as a numbered, idempotent migration in `backend/migrations/`.

Target database: `bingnondo_db` on PostgreSQL 16 (localhost:5432).
This entry diffs against the last push: `11b7c29`
(`origin/feat/admin-mobile-filters-online-orders`).

---

## 015 — Drop the dashboard-switch tables
- **Date:** 2026-10-15
- **Type:** Schema
- **File:** `backend/migrations/015_drop_switch_tables.sql`
- **Why:** The "switch into another dashboard" feature was removed from the app.
  No endpoint reads or writes these tables any more, so they are dropped to stop
  the schema from drifting.
- **Applied:**
  - Dropped `dashboard_switch_config` (and `dashboard_switch_config_id_seq`).
  - Dropped `staff_dashboard_access` (and `staff_dashboard_access_id_seq`).
  - Dropped `staff_switch_pin`.
  - Each table's own keys, indexes and foreign keys come away via `CASCADE`
    (net: 5 foreign keys, 9 indexes, 2 sequences).

---

## Current DB snapshot — 2026-10-15
- **Database:** `bingnondo_db` @ PostgreSQL 16 (localhost:5432), schema `public`
- **Compared against:** last push `11b7c29`
- **Method:** live introspection (read-only) vs the schema as of that push.

### Totals vs last push
| Metric | Last push | Now | Δ |
|---|---:|---:|---:|
| Tables | 30 | 27 | −3 |
| Foreign keys | 42 | 37 | −5 |
| Indexes | 76 | 67 | −9 |
| Sequences | 25 | 23 | −2 |
| Views | 0 | 0 | 0 |

### Net schema delta since last push
- **Removed — 3 tables:** `dashboard_switch_config`, `staff_dashboard_access`,
  `staff_switch_pin`.
  - Sequences removed: `dashboard_switch_config_id_seq`,
    `staff_dashboard_access_id_seq`.
  - Foreign keys removed (all → `staff_accounts.id`):
    `dashboard_switch_config_configured_by_fkey`,
    `dashboard_switch_config_staff_id_fkey`,
    `staff_dashboard_access_granted_by_fkey`,
    `staff_dashboard_access_staff_id_fkey`, `staff_switch_pin_staff_id_fkey`.
  - Indexes removed: 3 primary-key, 3 unique-constraint, 3 explicit.
- **Nothing else changed:** no table, column or constraint was added, altered or
  renamed since the last push.

### How to sync your database
1. `git pull`
2. `npm --prefix backend run migrate`
