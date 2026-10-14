# Database Changes Log

Running log of **schema** changes made to the local PostgreSQL database for this
project — tables, columns, indexes and constraints only. Data seeding is
intentionally not logged here. Each schema change is shipped as a numbered,
idempotent migration in `backend/migrations/`.

Target database: `bingnondo_db` on PostgreSQL 16 (localhost:5432).

---

## 001 — Import base schema
- **Date:** 2026-10-13
- **Type:** Schema import
- **Source:** `bingnondo_database-schema.sql` (schema-only dump exported from PostgreSQL 18.6)
- **Applied:** Imported into a clean `bingnondo_db`.
- **Notes:**
  - PG18-only statements were stripped into a cleaned copy before import (the
    original dump was left untouched).
  - Result: 28 tables and 39 foreign keys.
  - Command: `psql -U postgres -h localhost -d bingnondo_db -f <cleaned-dump>.sql`

## 002 — Migration `008_esp32_devices.sql`
- **Date:** 2026-10-13
- **Type:** Schema
- **File:** `backend/migrations/008_esp32_devices.sql`
- **Why:** `GET /api/kitchen/alerts` LEFT JOINs `esp32_devices`, but the table was
  missing from the imported schema, causing PostgreSQL error `42P01`
  (relation "esp32_devices" does not exist).
- **Applied:**
  - Created sequence `esp32_devices_id_seq` and table `esp32_devices`.
  - Added primary key `esp32_devices_pkey`.
  - Added FK `kitchen_alerts_device_id_fkey` (`kitchen_alerts.device_id` → `esp32_devices.id`).
  - Added unique index `idx_esp32_devices_device_code_unique` on `device_code`.

## 012 — Inventory categories
- **Date:** 2026-10-14
- **Type:** Schema
- **File:** `backend/migrations/012_inventory_categories.sql`
- **Status:** Superseded by 013 (kept for history).
- **Why:** The Inventory page gains a managed category list. Ingredients had no
  category concept, so a new `inventory_categories` table and a nullable
  `inventory_items.category_id` foreign key were added. Menu categories
  (`menu_categories`) are unchanged and separate.
- **Applied:**
  - Created sequence `inventory_categories_id_seq` and table `inventory_categories`.
  - Added primary key `inventory_categories_pkey`.
  - Added unique index `uq_inventory_categories_name` on `LOWER(name)`.
  - Added nullable column `inventory_items.category_id`.
  - Added FK `inventory_items_category_id_fkey`
    (`inventory_items.category_id` → `inventory_categories.id`, `ON DELETE SET NULL`).
  - Added index `idx_inventory_items_category_id`.

## 013 — Inventory uses menu categories
- **Date:** 2026-10-14
- **Type:** Schema
- **File:** `backend/migrations/013_inventory_menu_categories.sql`
- **Why:** Decision changed: inventory no longer keeps its own category list.
  Ingredients reference the existing `menu_categories` (managed in Menu
  Management), so the temporary `inventory_categories` table from 012 is removed
  and the `inventory_items.category_id` foreign key is repointed.
- **Applied:**
  - Carried over any `inventory_categories` rows to `menu_categories` by
    case-insensitive name match; unmatched ids set to `NULL`.
  - Dropped FK `inventory_items_category_id_fkey`.
  - Added FK `inventory_items_menu_category_id_fkey`
    (`inventory_items.category_id` → `menu_categories.id` `ON DELETE SET NULL`).
  - Dropped table `inventory_categories` and sequence `inventory_categories_id_seq`.
  - Kept index `idx_inventory_items_category_id` (still useful).

## 014 — Inventory items have multiple categories
- **Date:** 2026-10-14
- **Type:** Schema
- **File:** `backend/migrations/014_inventory_item_categories.sql`
- **Status:** Supersedes 013's single-category column.
- **Why:** An ingredient can belong to more than one menu category, so the
  single `inventory_items.category_id` column is replaced by a many-to-many
  junction table with `menu_categories`.
- **Applied:**
  - Created table `inventory_item_categories` with columns
    `inventory_item_id` / `category_id`.
  - Added PK `inventory_item_categories_pkey` (`inventory_item_id`, `category_id`).
  - Added FKs `inventory_item_categories_item_id_fkey` →
    `inventory_items(id)` and `inventory_item_categories_category_id_fkey` →
    `menu_categories(id)`, both `ON DELETE CASCADE`.
  - Added index `idx_inventory_item_categories_category_id`.
  - Backfilled existing `inventory_items.category_id` values into the junction.
  - Dropped FK `inventory_items_menu_category_id_fkey`, index
    `idx_inventory_items_category_id`, and column `inventory_items.category_id`.

---

## Current DB snapshot — 2026-10-14
- **Database:** `bingnondo_db` @ PostgreSQL 16 (localhost:5432), schema `public`
- **Compared against:** last push `2addd57` (`origin/feat/admin-mobile-filters-online-orders`)
- **Method:** live introspection (read-only) vs committed migrations at HEAD.

### Totals vs last push
| Metric | Last push | Now | Δ |
|---|---:|---:|---:|
| Tables | 29 | 30 | +1 |
| Foreign keys | 40 | 42 | +2 |
| Indexes | 71 | 73 | +2 |
| Sequences | 25 | 25 | 0 |
| Views | 0 | 0 | 0 |

### Tables (30)
`audit_log`, `business_hours`, `chatbot_conversations`, `chatbot_messages`,
`customer_order_violations`, `customer_restrictions`, `customers`,
`dashboard_switch_config`, `deliveries`, `esp32_devices`,
**`inventory_item_categories`**, `inventory_items`, `inventory_transactions`,
`kitchen_alerts`, `menu_categories`, `menu_item_ingredients`, `menu_items`,
`notifications`, `order_items`, `order_status_history`, `orders`,
`otp_verifications`, `payments`, `pending_registrations`, `riders`,
`staff_accounts`, `staff_dashboard_access`, `staff_switch_pin`,
`support_chat_messages`, `support_chats`.

### Net schema delta since last push
- **Added — `inventory_item_categories`** (junction table):
  - Columns: `inventory_item_id integer NOT NULL`, `category_id integer NOT NULL`.
  - PK `inventory_item_categories_pkey` (`inventory_item_id`, `category_id`).
  - FK `inventory_item_categories_item_id_fkey` → `inventory_items(id)` `ON DELETE CASCADE`.
  - FK `inventory_item_categories_category_id_fkey` → `menu_categories(id)` `ON DELETE CASCADE`.
  - Index `idx_inventory_item_categories_category_id` (`category_id`).
- **Net-zero churn (no current difference):**
  - `inventory_categories` table + sequence — added (012), dropped (013).
  - `inventory_items.category_id` column + FK/index — added (012), dropped (014).

### Notes
- `inventory_items` columns are exactly `id`, `name`, `unit`, `current_stock`,
  `reorder_level`, `updated_at` (no `category_id`).
- No drift: the live DB equals the base dump + migrations 002–014. The untracked
  `bingnondo_database-schema.sql` (PostgreSQL 18.6) predates `esp32_devices` and
  `inventory_item_categories`. Data seeding is intentionally not logged.

