# Database Changes Log

Running log of **schema** changes for this project — tables, columns, indexes
and constraints only. Data seeding is intentionally not logged here. Each
schema change ships as a numbered, idempotent migration in `backend/migrations/`.

Target database: `bingnondo_db` on PostgreSQL 16 (localhost:5432).
This entry diffs against the last PR: **#28** (`2545f2c`, merge of
`feat/admin-mobile-filters-online-orders` @ `2addd57` into `main`).
Migrations 012–020 below are not on `main` yet.

---

## 024 — Keep the reason a receipt was rejected
- **Date:** 2026-10-22
- **Type:** Schema
- **Files:** `backend/migrations/023_payments_previous_rejection_reason.sql`
- **Why:** The customer re-upload clears `payments.rejection_reason` — the
  payment goes back into the verification queue, so it no longer carries a
  rejection. That meant the cashier's online-orders console lost the reason
  the customer had to re-upload: it survived only in the browser, until a
  reload. The cashier's console already renders a "Was rejected for" row from
  `previous_rejection_reason`; the backend now supplies it.
- **Applied:**
  - Added `payments.previous_rejection_reason` (`varchar(255)`, nullable) —
    why the receipt was rejected, copied from `rejection_reason` when staff
    rejects a receipt and kept after the customer re-uploads.
  - Backfill: `previous_rejection_reason = rejection_reason` for rows that
    already carried a rejection.
  - Backward compatible: new column only. No existing data was rewritten apart
    from the backfill above, and no existing query changes shape — the column
    is only added to the `payments` read path.

---

## 023 — GCash receipt re-submission columns
- **Date:** 2026-10-21
- **Type:** Schema
- **Files:** `backend/migrations/add_previous_receipt.sql`,
  `backend/migrations/add_resubmit_columns.sql`
- **Why:** The cashier's online-orders console can now compare a rejected
  GCash receipt against the customer's replacement side by side. That needs the
  rejected receipt to survive the replacement, plus a record of how many times
  a payment has been rejected and when it was last re-uploaded.
- **Applied:**
  - Added `payments.previous_receipt_image_url` (`text`, nullable) — the URL of
    the receipt that was rejected, archived when the customer uploads a
    replacement.
  - Added `payments.resubmitted_at` (`timestamp`, nullable) — when the customer
    last re-uploaded after a rejection.
  - Added `payments.rejection_count` (`integer`, default `0`) — incremented
    every time staff rejects the payment.
  - Backfill: `rejection_count = 1` for rows that already had `rejected_at`
    set (best estimate for pre-existing data).
  - Backward compatible: new columns only; the defaults keep existing rows
    valid and no existing data was rewritten apart from the backfill above.

---

## 022 — Menu item ratings & reviews
- **Date:** 2026-10-21
- **Type:** Schema
- **File:** `backend/migrations/022_menu_item_reviews.sql`
- **Why:** The customer app shows a "Ratings & Reviews" section on each menu
  item, but the endpoint behind it was never built. This table backs
  `GET /api/menu/items/:id/reviews` and also feeds the `avg_rating` /
  `review_count` shown on the manager dashboard's menu cards.
- **Applied:**
  - Added table `menu_item_reviews` (`id`, `menu_item_id`, `customer_id`,
    `author_name`, `rating`, `comment`, `created_at`).
  - `menu_item_id → menu_items(id)` **ON DELETE CASCADE** — removing an item
    removes its reviews.
  - `customer_id → customers(id)` **ON DELETE SET NULL**, nullable — the
    reviewing account is optional; `author_name` is a display snapshot so it
    survives account deletion or renaming.
  - `CHECK (rating BETWEEN 1 AND 5)`.
  - Indexes on `(menu_item_id)` and `(customer_id)`.
  - Partial unique index `uq_menu_item_reviews_item_customer` on
    `(menu_item_id, customer_id)` **WHERE `customer_id IS NOT NULL`** — one
    review per customer per item (re-submitting updates); anonymous/seed rows
    are exempt.
  - Backward compatible: new table only; no existing data touched. Sample rows
    are seeded separately via `npm --prefix backend run seed:reviews` (data, not
    schema — not logged here).

---

## 021 — Recipe units for menu item ingredients
- **Date:** 2026-10-20
- **Type:** Schema
- **File:** `backend/migrations/021_recipe_units.sql`
- **Why:** An inventory item's stock is tracked in one unit (e.g. Milk in
  liters), but recipes commonly use a smaller unit (e.g. 150 ml per serving).
  Each ingredient link can now carry the unit the recipe is written in plus the
  factor that converts it into the ingredient's stock unit, so stock deduction
  stays correct without admins doing the math by hand.
- **Applied:**
  - Added `menu_item_ingredients.unit` (`varchar(20)`, nullable — the recipe
    unit; `NULL` means "same as the inventory stock unit").
  - Added `menu_item_ingredients.conversion_factor` (`numeric(14,6)`, nullable —
    multiplier recipe unit → stock unit, e.g. `1 ml = 0.001 liter`; `NULL`
    means factor `1`).
  - Backward compatible: existing links keep `unit = NULL` /
    `conversion_factor = NULL`, which deduction treats as same-unit (no change
    to current behaviour).

---

## 020 — Variant groups: name + max options only
- **Date:** 2026-10-20
- **Type:** Schema
- **File:** `backend/migrations/020_group_max_options.sql`
- **Why:** A variant group becomes a pure template — a name and the maximum
  number of options an item may offer for it (e.g. "Flavor — max 3"). Option
  names and prices are typed per menu item in Menu Management, so two items can
  offer different choices (and different prices) under the same group.
- **Applied:**
  - Added column `variant_groups.max_options` (`integer NOT NULL DEFAULT 3`) +
    check `chk_variant_groups_max_options` (`BETWEEN 1 AND 10`).
  - Dropped column `menu_item_variants.variant_group_option_id`, its FK
    (`menu_item_variants_variant_group_option_id_fkey`), index
    (`idx_menu_item_variants_group_option`) and unique index
    (`uq_menu_item_variants_item_group_option`).
  - Dropped table `variant_group_options` (+ its sequence) — option names are
    no longer global.
  - Added unique index `uq_menu_item_variants_item_group_name`
    (`menu_item_id`, `variant_group_id`, `LOWER(name)`) where
    `variant_group_id IS NOT NULL` — an item's option names are unique within a
    group. `uq_menu_item_variants_item_name_legacy` (`menu_item_id`, `name`)
    where `variant_group_id IS NULL` still covers legacy flat variants.

---

## 019 — Category variant groups + per-item variant prices
- **Date:** 2026-10-20
- **Type:** Schema
- **File:** `backend/migrations/019_category_variants_item_prices.sql`
- **Why:** Variant groups become pure option-name definitions ("Flavor" →
  Chocolate, Vanilla). Each category toggles which groups it offers, and the
  price of each option is set per menu item — the same option can cost more or
  less depending on the item, and an item can simply not offer an option
  (no row) instead of inventing a placeholder.
- **Applied:**
  - Dropped column `variant_group_options.price` (prices now live on
    `menu_item_variants` per item).
  - Added table `menu_category_variant_groups` (`category_id` FK →
    `menu_categories` `ON DELETE CASCADE`, `variant_group_id` FK →
    `variant_groups` `ON DELETE CASCADE`, composite PK) + 2 lookup indexes
    (+1 table, +1 sequence, +2 indexes, +2 foreign keys). Toggling a group OFF
    for a category deletes that group's `menu_item_variants` rows for items in
    the category (order history keeps its `variant_name` snapshots).
  - Added columns `menu_item_variants.variant_group_id` and
    `menu_item_variants.variant_group_option_id` (FKs → `variant_groups` /
    `variant_group_options`, `ON DELETE CASCADE`) + 3 indexes
    (`idx_menu_item_variants_menu_item_group`,
    `idx_menu_item_variants_group_option`,
    `idx_menu_item_variants_menu_item_id`).
  - Replaced unique `uq_menu_item_variants_item_name` (which blocked two
    groups from sharing an option name on one item) with:
    - `uq_menu_item_variants_item_group_option` (`menu_item_id`,
      `variant_group_option_id`) — one price per option per item;
    - `uq_menu_item_variants_item_name_legacy` (`menu_item_id`, `name`) where
      `variant_group_id IS NULL` — legacy flat variants keep the uniqueness
      guarantee.

---

## 018 — Variant groups
- **Date:** 2026-10-17
- **Type:** Schema
- **File:** `backend/migrations/018_variant_groups.sql`
- **Why:** Reusable variant definitions ("Flavor", "Solo / Sharing", "Hot /
  Cold") are set up once in System Settings — a named group with its priced
  options — instead of retyping the same list on every menu item.
  `menu_item_variants` stays the per-item runtime table the cashier and
  ordering flow read; attaching a group's options to items comes later and
  will write into that table.
- **Applied:**
  - Added table `variant_groups` (`id` PK, `name` varchar(100), `created_at`,
    `updated_at`). Names are unique case-insensitively
    (`uq_variant_groups_name`) (+1 table, +1 sequence).
  - Added table `variant_group_options` (`id` PK, `group_id` FK →
    `variant_groups` `ON DELETE CASCADE`, `name` varchar(100), `price`
    numeric(10,2), `display_order` smallint default 0, `created_at`). Option
    names are unique per group case-insensitively
    (`uq_variant_group_options_group_name`) + lookup index
    (`idx_variant_group_options_group_id`) (+1 table, +1 foreign key,
    +2 indexes, +1 sequence).

---

## 017 — Menu item variants
- **Date:** 2026-10-17
- **Type:** Schema
- **File:** `backend/migrations/017_menu_item_variants.sql`
- **Why:** Menu items can now be sold in flavors/sizes with their own absolute
  price (e.g. "Halo-Halo Regular ₱75 / Large ₱95"). The base item price is only
  used while an item has no variants. Ingredients/recipes stay linked to the
  menu item itself, and stock deducts per menu item, not per variant.
- **Applied:**
  - Added table `menu_item_variants` (`id` PK, `menu_item_id` FK →
    `menu_items` `ON DELETE CASCADE`, `name` varchar(100), `price`
    numeric(10,2), `is_available` bool default true, `display_order` smallint
    default 0, `created_at`). Variant names are unique per menu item
    (`uq_menu_item_variants_item_name`) and lookups get
    `idx_menu_item_variants_menu_item_id` (+1 table, +1 foreign key,
    +3 indexes, +1 sequence).
  - Added `order_items.variant_id` (nullable FK → `menu_item_variants`
    `ON DELETE SET NULL`) and `order_items.variant_name` varchar(100) — the
    receipt/kitchen snapshot that survives a variant delete or rename
    (+1 foreign key).

---

## 016 — System settings store + notification markers
- **Date:** 2026-10-17
- **Type:** Schema
- **File:** `backend/migrations/016_system_settings_notifications.sql`
- **Why:** The Admin Overview notification bell needs (a) server-persisted
  visibility settings ("which event categories show up"), (b) an unread marker
  per admin, and (c) a rejection timestamp for GCash receipts — the reject
  flow only stored `status` + `rejection_reason`.
- **Applied:**
  - Added table `system_settings` (`key` varchar(100) PK, `value` jsonb,
    `updated_at`) — generic key/value store for admin-configurable system
    options. Seeded with the `notifications` row (all 7 categories visible).
    Adds 1 index (`system_settings_pkey`).
  - Added `staff_accounts.notification_seen_at` (timestamp, nullable).
  - Added `payments.rejected_at` (timestamp, nullable).

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

## 012–014 — Inventory category series
- **Date:** 2026-10-14
- **Type:** Schema
- **Files:** `backend/migrations/012_inventory_categories.sql`,
  `013_inventory_menu_categories.sql`, `014_inventory_item_categories.sql`
- **Why:** Inventory ingredients gained managed categories. 012 introduced a
  dedicated `inventory_categories` list; 013 switched to the existing
  `menu_categories`; 014 made the link many-to-many.
- **Applied (net):**
  - Added junction table `inventory_item_categories`: PK
    `(inventory_item_id, category_id)`, foreign keys to `inventory_items` and
    `menu_categories`, index on `category_id` (+1 table, +2 foreign keys,
    +2 indexes).
  - The transient `inventory_categories` table + sequence and the single
    `inventory_items.category_id` column (with its foreign key and index)
    were created and dropped within the series — net zero.

---

## Current DB snapshot — 2026-10-17
- **Database:** `bingnondo_db` @ PostgreSQL 16 (localhost:5432), schema `public`
- **Compared against:** last PR `#28` (`2545f2c`)
- **Method:** live introspection (read-only) vs the schema as of that PR
  (current schema with the 012–017 effects reversed).
  `bingnondo_database-schema.sql` regenerated with pg_dump 16.15
  (`--clean --if-exists --no-owner --no-privileges`).

### Totals vs last PR
| Metric | Last PR | Now | Δ |
|---|---:|---:|---:|
| Tables | 29 | 29 | 0 |
| Foreign keys | 40 | 39 | −1 |
| Indexes | 74 | 71 | −3 |
| Sequences | 25 | 24 | −1 |
| Views | 0 | 0 | 0 |

### Net schema delta since last PR
- **Added — 1 table:** `inventory_item_categories` (ingredient ↔ menu
  category junction; migrations 012–014). +2 foreign keys, +2 indexes.
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
- **Added — 1 table:** `system_settings` (key/value store for admin system
  options; migration 016). PK index `system_settings_pkey` (+1 index).
  - Columns added: `staff_accounts.notification_seen_at`,
    `payments.rejected_at` (no index changes).
- **Added — 1 table:** `menu_item_variants` (flat flavor/size list per menu
  item, own absolute price; migration 017). +1 foreign key (`menu_items`),
  +3 indexes (PK, unique item+name, item lookup), +1 sequence.
  - Columns added: `order_items.variant_id` (FK → `menu_item_variants`,
    `ON DELETE SET NULL`) and `order_items.variant_name` (snapshot;
    +1 foreign key).

### Since PR #28
- **Migrations 012–014** (inventory category series, 2026-10-14) and
  **015** (dashboard-switch tables dropped, 2026-10-15) — see the entries
  above.
- **Migration 016** (notification feature): added `system_settings`,
  `staff_accounts.notification_seen_at`, `payments.rejected_at` — see the
  016 entry above.
- **Migration 017** (menu item variants): added `menu_item_variants` and
  `order_items.variant_id` / `order_items.variant_name` — see the 017 entry
  above.
- Non-schema work (forgot-password OTP reset flow, User Accounts /
  restriction management, notification feed) reused existing structures:
  `otp_verifications` (purpose `password_reset`), `customer_restrictions`,
  `customers.status`, and `audit_log` action rows (`self_reset_password`,
  `customer_account_status_change`, `update_notification_settings`).
- The dump was refreshed to capture the 016/017 schema additions plus
  data-level drift only (orders, payments, inventory, kitchen alerts, audit
  entries, staff accounts). Per the policy at the top of this file, data rows
  are not tracked in this log.

### How to sync your database
1. `git pull`
2. `npm --prefix backend run migrate`
