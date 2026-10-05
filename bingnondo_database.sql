-- ============================================================
-- BINGNONDO CAFE SYSTEM — DATABASE SCHEMA (PostgreSQL)
-- Normalized to Third Normal Form (3NF):
--   1NF - atomic columns, no repeating groups (all repeating
--         groups extracted into their own tables)
--   2NF - every non-key attribute depends on the WHOLE primary
--         key (no partial dependency on composite keys)
--   3NF - no transitive dependencies (non-key attributes do not
--         depend on other non-key attributes)
-- Tables are created in dependency order (parents before children).
-- ============================================================
--
-- SCOPE OF THIS FILE
--
-- This is the INTENDED full schema, not a description of the
-- running database. Several tables below are defined for modules
-- that have no backend yet, and each is annotated accordingly.
--
-- Per-table markers used throughout:
--
--   [USED]      The current backend reads or writes this table.
--   [UNUSED]    Defined for a planned module. No code path in
--               backend/ touches it yet. See the annotation for
--               which module will own it.
--
-- To check which of these the code actually touches:
--   Get-ChildItem -Recurse -File backend\src,backend\server.js `
--     -Include *.js | Select-String -Pattern 'FROM <table_name>'
--
-- ============================================================
-- MIGRATION STATUS — THIS FILE IS THE COMPLETE CANONICAL SCHEMA
-- ============================================================
--
-- This file now FOLDS IN every migration in backend/migrations/
-- (002 through 023). A database created from this file alone has
-- the same shape the migrations produce, so you no longer need to
-- run the migrations afterwards. The numbered migration files
-- remain as the history of how the schema evolved.
--
-- What the migrations added that is now represented below:
--   002  idx_order_items_order_id, idx_payments_order_id
--   003  idx_payments_order_id_unique (enforces one payment/order)
--   004  esp32_devices.device_code NOT NULL, status, last_ping_at,
--        idx_esp32_devices_device_code_unique
--   005  idx_kitchen_alerts_one_open_per_order (partial unique)
--   007  menu_items.archived_at (soft delete; row is kept so past
--        order_items keep resolving)
--   008  menu_item_options table; order_items.menu_item_option_id;
--        idx_menu_item_options_active_name / _item / idx_order_items_option
--   009  (corrects 008's table-level UNIQUE into the partial index above)
--   010  inventory_item_categories table; idx_inventory_item_categories_category
--   011  menu_item_options.option_kind (variant/flavor);
--        order_items.menu_item_flavor_id; idx_order_items_flavor
--   013  refresh_tokens table; idx_refresh_tokens_family
--   014  orders.order_type CHECK pinned to ('online','counter')
--   015  inventory_transactions.inventory_item_id FK -> ON DELETE CASCADE
--   016  (supersedes 015) the same FK -> ON DELETE RESTRICT
--        [the final state below is RESTRICT]
--   017  staff_accounts role CHECK gains 'manager'; status CHECK gains 'suspended'
--   018  (additive) customers/deliveries/chatbot/support/notifications/audit/
--        violations/restrictions tables, orders.customer_id,
--        payments.paymongo_payment_id — all already present below
--   019  the canonical indexes listed in section 11
--   020  inventory_transactions.reference_order_id + idx_inventory_txns_order_item
--   021  payments.cash_given, payments.change_given
--   022  payments.created_at (already present below) + paid_at backfill
--   023  idx_inventory_txns_order_item narrowed to deduction rows only
--
-- KNOWN GAP (still unfixed): 002's header comment says orders is
-- "already covered by idx_orders_created (created_at DESC)". That
-- index is created by neither this file nor any migration. The
-- manager sales report's date-range scan is therefore running
-- unindexed until someone adds it:
--
--   CREATE INDEX idx_orders_created ON orders (created_at DESC);
--
-- TOOLING NOTE: backend/package.json "migrate" runs
--   migrations/001_add_otp_verifications.sql, which does not exist
--   (the chain starts at 002). `npm run migrate` therefore fails;
--   apply migrations by hand with psql, or build from this file.
-- ============================================================

-- ============================================================
-- 1. ACCOUNTS & AUTH
-- ============================================================

-- [UNUSED] customers — owned by the Customer/mobile-app module.
-- There are no customer auth routes in the backend today; auth.routes.js
-- exposes staff login, password reset, refresh, logout and /me only.
-- Nothing in backend/ queries this table yet.

-- Customers (self-registered via mobile app)
-- Progressive registration: only email/password/OTP required at sign-up.
-- Profile fields stay NULL until the customer completes their profile,
-- which is REQUIRED (gated) before placing a first order — see
-- profile_completed flag and the ordering-gate logic in the flow doc.
CREATE TABLE customers (
    id                SERIAL PRIMARY KEY,
    email             VARCHAR(255) UNIQUE NOT NULL,
    password_hash     VARCHAR(255) NOT NULL,
    email_verified    BOOLEAN DEFAULT FALSE,
    first_name        VARCHAR(50),                 -- filled in during profile completion
    last_name         VARCHAR(50),                 -- filled in during profile completion
    mobile_number     VARCHAR(20) UNIQUE,           -- nullable until profile completion
    mobile_verified   BOOLEAN DEFAULT FALSE,
    address           TEXT,                         -- filled in during profile completion
    profile_completed BOOLEAN DEFAULT FALSE,        -- gate flag: must be TRUE before ordering
    status            VARCHAR(30) DEFAULT 'awaiting_verification'
                          CHECK (status IN ('awaiting_verification','active','suspended')),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 3NF: every column (email, mobile_number, password_hash, status, etc.)
-- describes the customer identified by id, and only that customer.
-- first_name/last_name/mobile_number/address are nullable by design —
-- this reflects the two-stage sign-up, not a normalization issue.

-- [USED] staff_accounts — the only account table the backend reads today.
-- Queried by auth.controller.js (login lookup, /me) and referenced as the
-- actor column across orders, payments, inventory and menu writes.
--
-- ROLE / STATUS (migration 017): the CHECK below is the effective source
-- of truth for the system's roles. It includes 'manager', which the
-- frontend honors in two places: App.jsx gates /manager on
-- ['manager','owner'], and sockets/index.js adds 'manager' to MANAGER_ROLES.
-- A 'manager' row can now be created, so that branch is reachable.
-- 'suspended' is likewise permitted by the status CHECK.
--
-- Staff-side accounts: cashier, kitchen_staff, staff, owner, admin, manager
-- Self-referencing FK: created_by = which Admin created this account
CREATE TABLE staff_accounts (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL
                        CHECK (role IN ('cashier','kitchen_staff','staff','owner','admin','manager')),
    status          VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','deactivated','suspended')),
    created_by      INTEGER REFERENCES staff_accounts(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [USED] refresh_tokens — server-side registry of refresh-token hashes
-- (migration 013). auth.controller.js inserts a row on login, looks the
-- token up by hash on refresh, revokes the whole family_id line when a
-- reused token is detected, and marks rotated rows replaced_by. Keeping
-- only the hash server-side makes a stolen refresh token useless against
-- the database, and family-based revocation turns "the old token came
-- back" into "someone is replaying tokens, kill the whole session line".
CREATE TABLE refresh_tokens (
    id               SERIAL PRIMARY KEY,
    staff_account_id INTEGER NOT NULL REFERENCES staff_accounts(id) ON DELETE CASCADE,
    token_hash       TEXT NOT NULL UNIQUE,
    family_id        UUID NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at       TIMESTAMPTZ,
    replaced_by      INTEGER REFERENCES refresh_tokens(id)
);

-- [USED] otp_verifications — written and read by auth.otp.js (storeOtp /
-- verifyOtp). Currently serves staff password reset only; the
-- 'email_verification' and 'mobile_verification' purposes are unused
-- because there is no customer registration flow yet.
--
-- SECURITY: otp_code is stored as PLAINTEXT, not hashed. auth.otp.js
-- acknowledges this in a comment. A read of this table yields every
-- live reset code. Hash it (bcrypt) before this table holds anything
-- sensitive in production.
--
-- OTP codes — separate from customers table (1NF/3NF: an OTP is an event,
-- not a static attribute of a customer, and a contact can have many OTPs
-- over time; storing it on customers would create a repeating-group problem)
CREATE TABLE otp_verifications (
    id          SERIAL PRIMARY KEY,
    contact     VARCHAR(255) NOT NULL,      -- email or mobile number
    otp_code    VARCHAR(6) NOT NULL,
    purpose     VARCHAR(30) NOT NULL
                    CHECK (purpose IN ('email_verification','mobile_verification','password_reset')),
    expires_at  TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. MENU & INVENTORY
-- ============================================================

-- [USED] menu_categories — read by menu.controller.js for the public menu
-- and staff menu views; created/deleted via /api/menu/categories.
CREATE TABLE menu_categories (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(100) UNIQUE NOT NULL
);

-- [USED] inventory_items — read/written by inventory.controller.js and
-- by payments.controller.js (see below).
--
-- STOCK CHANGES HAVE TWO PATHS:
--   1. MANUAL — inventory.controller.js accepts change_type of
--      'restock', 'deduction' and 'adjustment' through
--      POST /api/inventory/:id/transaction.
--   2. AUTOMATIC ON PAYMENT — payments.controller.js deductInventory()
--      writes a 'deduction' row per ingredient when a cash payment
--      succeeds (see inventory_transactions and payments below), and
--      decrements current_stock in the same transaction. So stock IS
--      deducted automatically once an order is paid; it is not only
--      edited by hand.
-- inventory_transactions.reference_order_id is written by path 2, so a
-- deduction row is attributable to the order that consumed the stock.

-- Raw ingredient/stock records
CREATE TABLE inventory_items (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) UNIQUE NOT NULL,
    unit            VARCHAR(20) NOT NULL,       -- kg, pcs, liters, etc.
    current_stock   NUMERIC(10,2) NOT NULL DEFAULT 0,
    reorder_level   NUMERIC(10,2) DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [USED] menu_items — the most-read table in the system. menu.controller.js
-- (public + staff views, CRUD, availability toggle, archive), orders.controller.js
-- (price lookup and availability check at order time), and
-- inventory.controller.js (cascading is_available when stock changes).
--
-- SOFT DELETE (migration 007): a menu item is never hard-DELETEd.
-- order_items.menu_item_id has no ON DELETE clause and stores no name
-- snapshot, so deleting a row that past orders reference would fail the FK
-- and would blank the item name on old receipts. Instead the row is archived
-- by setting archived_at; every listing filters `archived_at IS NULL`, so the
-- item disappears from the menu while history keeps resolving. menu_item_options
-- (below) applies the same treatment to variants.
--
-- CASCADE BEHAVIOUR THAT DOES EXIST: POST /api/inventory/:id/out-of-stock
-- forces an ingredient to 0 and flips is_available=false (and archives) every
-- menu item linked to it. Restocking re-enables items, excluding those that
-- still have another out-of-stock ingredient. Both broadcast `menu_update`.
CREATE TABLE menu_items (
    id              SERIAL PRIMARY KEY,
    category_id     INTEGER NOT NULL REFERENCES menu_categories(id),
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    price           NUMERIC(10,2) NOT NULL,
    image_url       VARCHAR(500),
    is_available    BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at     TIMESTAMPTZ
);
-- 3NF: category_id references menu_categories rather than storing the
-- category name as text here — avoids a transitive dependency
-- (name -> category_id -> category details).
-- archived_at is set when the item is removed from the menu. The row is
-- kept because order_items reference it and store no name snapshot.

-- [USED] menu_item_options — sellable variants of a menu item, e.g. the
-- "Coffee is either Hot or Iced" case (migrations 008, 009, 011).
--
-- Why a child table rather than two menu_items rows: two rows means two
-- names to keep in sync, two photos, two ingredient links, two availability
-- toggles, and a customer who cannot tell whether the drink is missing or
-- merely filed under the wrong item.
--
-- Why an ABSOLUTE price on each option, not a delta: a delta has to be
-- added to something to become a price, so the authoritative figure would
-- be split across two columns and can drift. menu_items.price stays the
-- "from" price the menu shows for an item that has options; an item with
-- no options is charged that price directly. createOrder refuses an
-- optionless order for an item that does have options, so the two never
-- disagree about a real sale.
--
-- option_kind (migration 011) splits options into 'variant' (a form of the
-- item, e.g. Hot/Iced, Solo/Sharing) and 'flavor' (an add-on, e.g. Adobo).
-- A single order line can carry BOTH a variant and a flavor, and their
-- prices stack.
--
-- ARCHIVE, NOT DELETE (same reasoning as migration 007): order_items stores
-- a hard FK to menu_item_options(id) with NO ACTION and no name snapshot,
-- so removing a row would orphan old receipts. Options are archived by
-- setting archived_at instead.
CREATE TABLE menu_item_options (
    id            SERIAL PRIMARY KEY,
    menu_item_id  INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    price         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    is_available  BOOLEAN NOT NULL DEFAULT true,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    option_kind   TEXT NOT NULL DEFAULT 'variant'
                      CHECK (option_kind IN ('variant','flavor')),
    archived_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One live row per (menu_item_id, name). This is a PARTIAL index rather
-- than a table-level UNIQUE: a plain UNIQUE also counts archived rows, so
-- switching a drink's Hot/Iced toggle off and back on would hit a
-- duplicate-key error. With the partial index the name is reusable once the
-- old row is archived, and the archived row stays so old receipts resolve.
CREATE UNIQUE INDEX idx_menu_item_options_active_name
    ON menu_item_options (menu_item_id, name) WHERE archived_at IS NULL;
-- Menu lookups filter archived rows and sort by sort_order.
CREATE INDEX idx_menu_item_options_item
    ON menu_item_options (menu_item_id) WHERE archived_at IS NULL;

-- [USED] menu_item_ingredients — read by menu.controller.js for the staff
-- menu view (which ingredients back an item, and their live stock), written
-- by menu item create/update, and read by payments.controller.js to compute
-- the automatic stock deduction when an order is paid. It is also what the
-- out-of-stock cascade traverses to find affected menu items.
--
-- This is a recipe, not a consumption log: it states how much of each
-- ingredient ONE unit of the menu item requires. The actual consumption is
-- recorded as 'deduction' rows in inventory_transactions when the order is
-- paid (quantity_required * quantity ordered).
--
-- Junction table: which ingredients + how much a menu item consumes.
-- 2NF/3NF: quantity_required depends on the WHOLE composite key
-- (menu_item_id, inventory_item_id) together — not on either alone.
-- This also removes the many-valued "ingredients" attribute that would
-- otherwise sit on menu_items and violate 1NF.
CREATE TABLE menu_item_ingredients (
    menu_item_id      INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_required NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (menu_item_id, inventory_item_id)
);

-- [USED] inventory_item_categories — lets an ingredient carry the same
-- categories the menu uses, and more than one at a time (migration 010).
--
-- It reuses menu_categories rather than adding a second category table: the
-- shop has one set of categories and an ingredient list that has nothing to
-- gain from a parallel vocabulary.
--
-- Why a join table instead of a category_id column: an ingredient really can
-- belong to several categories at once (Chicken Siomai is used by both a
-- Student Meal and a Student Platter item), so a single column would force a
-- choice and hide it from the other list.
--
-- ON DELETE CASCADE on both sides, matching menu_item_ingredients. Dropping
-- an ingredient already erases its recipe links and movement history, so
-- quietly detaching a category tag costs nothing by comparison. The API
-- guards the menu_categories side instead: DELETE /api/menu/categories/:id
-- refuses to drop a category that ingredients still point at.
CREATE TABLE inventory_item_categories (
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    menu_category_id  INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (inventory_item_id, menu_category_id)
);
CREATE INDEX idx_inventory_item_categories_category
    ON inventory_item_categories (menu_category_id);

-- [USED] inventory_transactions — every stock change is written here, from
-- two paths:
--   1. inventory.controller.js — MANUAL restock / adjustment / deduction via
--      POST /api/inventory/:id/transaction.
--   2. payments.controller.js deductInventory() — AUTOMATIC 'deduction' rows
--      written when a cash payment succeeds, one per ingredient the order
--      consumed, carrying reference_order_id so the movement is attributable
--      to the order that caused it.
--
-- reference_order_id is declared INTEGER below and constrained to orders(id)
-- after the orders table (see section 3). The manual path (1) leaves it
-- NULL; the automatic path (2) sets it to the paid order's id.
--
-- The inventory_item_id FK is ON DELETE RESTRICT (migrations 015 then 016):
-- an ingredient cannot be deleted while it still has movement history, so the
-- audit trail is never silently erased.

-- Stock movement log — every restock/deduction/adjustment is its own atomic
-- row (1NF: no repeating "history" column crammed into inventory_items)
CREATE TABLE inventory_transactions (
    id                  SERIAL PRIMARY KEY,
    inventory_item_id   INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    change_type         VARCHAR(20) NOT NULL CHECK (change_type IN ('restock','deduction','adjustment')),
    quantity            NUMERIC(10,2) NOT NULL,
    reference_order_id  INTEGER,   -- NULL for manual moves; the order id for payment deductions
    performed_by        INTEGER REFERENCES staff_accounts(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- One deduction row per (order, ingredient). PARTIAL: it only covers
-- 'deduction' rows that carry a reference_order_id, so manual restock and
-- adjustment rows (reference_order_id NULL) are unrestricted.
-- payments.controller.js relies on this to make payment-time deduction
-- idempotent — a retried payment hits the conflict and does nothing instead
-- of double-deducting.
CREATE UNIQUE INDEX idx_inventory_txns_order_item
    ON inventory_transactions (reference_order_id, inventory_item_id)
    WHERE change_type = 'deduction' AND reference_order_id IS NOT NULL;

-- ============================================================
-- 3. ORDERS
-- ============================================================

-- [USED] orders — central table. Read and written by orders.controller.js
-- (create, list, totals, report, detail, status, cancel, edit items),
-- kitchen.controller.js (queue, acknowledge, status), and joined by
-- payments.controller.js.
--
-- OBSERVED VALUES:
--   order_type    — 'counter' only. The INSERT in orders.controller.js
--                   hardcodes the literal; there is no online path yet.
--   order_channel — 'web_counter' only, same reason. The 'mobile_app'
--                   value the column documents is currently unreachable.
--   status        — starts at 'pending'. The cashier-created order is NOT
--                   confirmed on creation; kitchen acknowledge performs
--                   pending -> confirmed. (payments.controller.js carries
--                   a stale comment claiming creation sets 'confirmed'
--                   — orders.controller.js:86 is the correct one.)
--
-- There is no order_number column. The human-readable number is derived at
-- query time as 'ORD-' || LPAD(id::text, 4, '0') — see the utils helper
-- orderNumber() and the identical inline expressions in the controllers.

CREATE TABLE orders (
    id              SERIAL PRIMARY KEY,
    order_type      VARCHAR(10) NOT NULL CHECK (order_type IN ('online','counter')),
    customer_id     INTEGER REFERENCES customers(id),       -- NULL for counter orders
    cashier_id      INTEGER REFERENCES staff_accounts(id),  -- NULL for online orders
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','preparing','ready',
                                           'out_for_delivery','completed','cancelled')),
    order_channel   VARCHAR(20) NOT NULL,   -- 'mobile_app' or 'web_counter'
    total_amount    NUMERIC(10,2) NOT NULL,
    special_request TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Now that orders exists, link inventory_transactions to it
ALTER TABLE inventory_transactions
    ADD CONSTRAINT fk_inventory_txn_order
    FOREIGN KEY (reference_order_id) REFERENCES orders(id);

-- [USED] order_items — inserted on order creation, fully replaced by
-- PATCH /api/orders/:id/items while the order is still 'pending', and joined
-- by the sales report for best-sellers and item-name search.

-- Order line items — repeating group extracted from orders (1NF).
-- unit_price is a price SNAPSHOT at order time (not a copy of
-- menu_items.price) — this is intentional, not a 3NF violation:
-- it is a historical fact about the order, which can legitimately
-- differ from the menu's current price after the order is placed.
--
-- menu_item_option_id and menu_item_flavor_id (migrations 008, 011) record
-- WHICH variant and WHICH flavor were sold on this line, so a receipt can
-- still name them after the option row is archived. Both are NULL for items
-- that have no options. The FKs are deliberately NO ACTION (not CASCADE):
-- archiving keeps the row, so the variant name on an old receipt keeps
-- resolving; a hard delete is refused rather than silently orphaning history.
CREATE TABLE order_items (
    id                   SERIAL PRIMARY KEY,
    order_id             INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id         INTEGER NOT NULL REFERENCES menu_items(id),
    menu_item_option_id  INTEGER REFERENCES menu_item_options(id),
    menu_item_flavor_id  INTEGER REFERENCES menu_item_options(id),
    quantity             INTEGER NOT NULL CHECK (quantity > 0),
    unit_price           NUMERIC(10,2) NOT NULL,
    notes                VARCHAR(255)
);

-- [USED] order_status_history — one row per real transition, written by
-- orders.controller.js and kitchen.controller.js. The initial 'pending' row
-- is written at order creation.
--
-- Re-setting a status an order already has is treated as a no-op and
-- deliberately writes NO history row, so a retried request does not
-- duplicate the audit entry.

-- Status change history — audit trail, one atomic row per transition
CREATE TABLE order_status_history (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL,
    changed_by  INTEGER REFERENCES staff_accounts(id),
    changed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. DELIVERY
-- ============================================================

-- [UNUSED] deliveries — no backend exists. There is no deliveries module,
-- controller or route; the only reference to this table in the repo is
-- frontend/src/services/managerApi.js:189, which returns a hardcoded empty
-- array and comments that nothing real can be read yet.
--
-- Consequence for the order lifecycle: the 'out_for_delivery' and
-- 'delivered' statuses are reachable in the schema's CHECK and in
-- status-transitions.js, but nothing writes them. The kitchen stops at
-- 'ready'. The Delivery pages render from mock data in the frontend only.

CREATE TABLE deliveries (
    id                   SERIAL PRIMARY KEY,
    order_id             INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    delivery_preference  VARCHAR(20) NOT NULL CHECK (delivery_preference IN ('own_delivery','lalamove')),
    assigned_by          INTEGER REFERENCES staff_accounts(id),
    rider_name           VARCHAR(100),
    rider_contact        VARCHAR(20),
    lalamove_booking_id  VARCHAR(100),
    status               VARCHAR(20) DEFAULT 'pending_assignment'
                             CHECK (status IN ('pending_assignment','assigned','out_for_delivery',
                                                'delivered','cancelled')),
    assigned_at          TIMESTAMP,
    delivered_at         TIMESTAMP
);
-- 3NF: order_id is UNIQUE -> this is a 1:1 extension of orders, kept
-- separate because delivery attributes only apply to online orders
-- and would otherwise leave many NULL columns on every counter order.

-- ============================================================
-- 5. PAYMENTS (PayMongo)
-- ============================================================

-- [USED] payments — one row is created per order at creation time with
-- status 'pending' and method 'cash', then updated in place by
-- POST /api/payments. It is never inserted a second time; the uniqueness
-- below plus migration 003 is what keeps that true.
--
-- ACTUAL PAYMENT BEHAVIOUR TODAY:
--   method 'cash'           — works. Validated against cash_given, which
--                              must cover total_amount, and the change is
--                              returned to the caller. On success it also
--                              runs deductInventory() (see
--                              inventory_transactions), which writes the
--                              automatic 'deduction' rows and decrements
--                              current_stock.
--   method 'gcash'          — returns HTTP 501. PayMongo is not wired up;
--                              processPayment short-circuits before any write.
--   method 'cash_on_delivery' — accepted by the method whitelist but the
--                              order creation path only ever creates 'cash',
--                              and there is no delivery flow to settle it.
--   status 'paid'           — set by the cashier action above.
--
-- cash_given / change_given (migration 021) record the cash tendered and
-- the change returned, so the drawer can be reconciled against the order.
--
-- A payment is refused for a cancelled order (409) and for an already-paid
-- order (409). Both checks run under SELECT ... FOR UPDATE on the order row,
-- which POST /api/orders/:id/cancel also locks, so a payment and a
-- cancellation cannot interleave.

CREATE TABLE payments (
    id                  SERIAL PRIMARY KEY,
    order_id            INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method              VARCHAR(20) NOT NULL CHECK (method IN ('gcash','cash','cash_on_delivery')),
    amount              NUMERIC(10,2) NOT NULL,
    paymongo_payment_id VARCHAR(150),
    status              VARCHAR(20) DEFAULT 'pending'
                            CHECK (status IN ('pending','paid','failed','refunded')),
    paid_at             TIMESTAMP,
    cash_given          NUMERIC(10,2),
    change_given        NUMERIC(10,2),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 6. KITCHEN & ESP32
-- ============================================================

-- [PARTIAL] esp32_devices — READ, and heartbeat-updated. kitchen.controller.js
-- LEFT JOINs this table when listing kitchen alerts, and payments.controller.js
-- looks up the target device by device_code when creating an alert. The ESP32
-- heartbeat (esp32.routes.js) UPDATEs status and last_ping_at on every poll,
-- so presence is tracked. What is still NOT real is registration: the Admin
-- device-registration UI writes to an in-memory MOCK_DEVICES array in
-- frontend/src/services/api.js, so no backend code path INSERTs a row and
-- registrations do not survive a reload.
--
-- The socket layer's `esp32:register` event lets a device claim the private
-- room esp32:<device_id> with no credential and no lookup against this
-- table. The architecture document describes a pre-shared device token
-- checked at handshake; that is not implemented.

CREATE TABLE esp32_devices (
    id             SERIAL PRIMARY KEY,
    device_code    VARCHAR(50) UNIQUE NOT NULL,
    location_label VARCHAR(100),
    status         VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online','offline')),
    last_ping_at   TIMESTAMP
);

-- [USED] kitchen_alerts — CREATED on payment, then read and acknowledged.
-- payments.controller.js INSERTs one alert per paid cash order, targeting the
-- device whose device_code the order resolves to (via esp32_devices), and
-- emits the `kitchen_alert` socket event. kitchen.controller.js lists the
-- queue and can set acknowledged_at / acknowledged_by. The partial unique
-- index below (migration 005) enforces at most ONE unacknowledged alert per
-- order, so a retried payment cannot double-notify the buzzer.
--
-- Registration of a NEW device is still mock-only (see esp32_devices), so in
-- practice alerts target whatever rows the seed data put in esp32_devices.

CREATE TABLE kitchen_alerts (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    device_id       INTEGER NOT NULL REFERENCES esp32_devices(id),
    triggered_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    acknowledged_by INTEGER REFERENCES staff_accounts(id)
);
-- One unacknowledged alert per order (migration 005). PARTIAL: only rows
-- where acknowledged_at IS NULL are covered, so a second, already-acknowledged
-- alert for the same order is allowed — only a second OPEN alert is refused.
CREATE UNIQUE INDEX idx_kitchen_alerts_one_open_per_order
    ON kitchen_alerts (order_id) WHERE acknowledged_at IS NULL;

-- ============================================================
-- 7. AI CHATBOT
-- ============================================================

-- [UNUSED] chatbot_conversations, chatbot_messages — owned by the AI chatbot
-- module, which is not implemented. There is no chatbot route, controller,
-- or OpenAI/Gemini client anywhere in backend/, and no page that calls one.

CREATE TABLE chatbot_conversations (
    id          SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    started_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chatbot_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
    sender          VARCHAR(10) NOT NULL CHECK (sender IN ('customer','bot')),
    content         TEXT NOT NULL,
    sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. CUSTOMER–STAFF SUPPORT CHAT
-- ============================================================

-- [UNUSED] support_chats, support_chat_messages — no backend exists. The
-- staff Support Chat page is fully built in the frontend but reads from
-- MOCK_CHAT_THREADS / MOCK_CHAT_MESSAGES in frontend/src/services/api.js,
-- so threads and messages live only in the browser tab.

-- One thread per customer (not per order) — unlocked while >= 1 active order
CREATE TABLE support_chats (
    id          SERIAL PRIMARY KEY,
    customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id),
    status      VARCHAR(10) DEFAULT 'locked' CHECK (status IN ('unlocked','locked')),
    opened_at   TIMESTAMP,
    locked_at   TIMESTAMP
);

CREATE TABLE support_chat_messages (
    id                SERIAL PRIMARY KEY,
    chat_id           INTEGER NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
    sender_type       VARCHAR(10) NOT NULL CHECK (sender_type IN ('customer','staff')),
    sender_id         INTEGER NOT NULL,   -- customers.id or staff_accounts.id depending on sender_type
    related_order_id  INTEGER REFERENCES orders(id),
    content           TEXT NOT NULL,
    sent_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Note: sender_id is polymorphic (points to customers OR staff_accounts
-- depending on sender_type) so it cannot carry a single FK constraint.
-- This is a deliberate, documented trade-off, not a normalization issue —
-- application code resolves sender_id using sender_type.

-- ============================================================
-- 9. NOTIFICATIONS & AUDIT
-- ============================================================

-- [UNUSED] notifications — no backend exists. There is no notifications
-- route, controller or socket emission anywhere in backend/; the Admin
-- Notifications page renders mock data.

CREATE TABLE notifications (
    id            SERIAL PRIMARY KEY,
    staff_id      INTEGER REFERENCES staff_accounts(id),  -- NULL = broadcast to a role
    target_role   VARCHAR(20),
    type          VARCHAR(50) NOT NULL,
    reference_id  INTEGER,
    is_read       BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [USED] audit_log — written, but not yet read. The backend persists a
-- real audit trail: auth.controller.js records failed staff logins
-- (staff_login_failed), payments.controller.js records payments,
-- menu.controller.js records menu updates and availability toggles,
-- orders.controller.js records cancellations, and scheduler.js records
-- automatic (timeout) cancellations. actor_id is NULL for system-driven
-- and anonymous events (e.g. a failed login before an account is known).
--
-- What is still missing is the READ side: there is no GET endpoint that
-- selects from audit_log, so the Admin Audit Log page still renders mock
-- data. The table is a write-only audit trail until that endpoint exists.
CREATE TABLE audit_log (
    id          SERIAL PRIMARY KEY,
    actor_id    INTEGER REFERENCES staff_accounts(id),
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id   INTEGER,
    details     JSONB,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 10. CUSTOMER ORDER VIOLATIONS & RESTRICTIONS
-- ============================================================

-- [UNUSED] customer_order_violations, customer_restrictions — no backend
-- exists. The Admin Customer Restrictions page is built in the frontend and
-- reads mocked violation and customer data. Note that
-- POST /api/orders/:id/cancel does NOT write a violation row today, so even
-- the parts of the graduated-response flow that are reachable do not
-- currently feed this table.

-- One row per cancellation/no-show incident (1NF: no repeating
-- "violation history" column crammed onto customers)
CREATE TABLE customer_order_violations (
    id             SERIAL PRIMARY KEY,
    customer_id    INTEGER NOT NULL REFERENCES customers(id),
    order_id       INTEGER NOT NULL REFERENCES orders(id),
    violation_type VARCHAR(30) NOT NULL
                       CHECK (violation_type IN ('cancelled_before_prep','cancelled_after_prep','no_show')),
    flagged_by     INTEGER REFERENCES staff_accounts(id),  -- NULL = system-triggered
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Current restriction state — 1:1 extension of customers, kept separate
-- so checkout only needs one fast lookup instead of scanning history
CREATE TABLE customer_restrictions (
    customer_id        INTEGER PRIMARY KEY REFERENCES customers(id),
    restriction_level  VARCHAR(20) NOT NULL DEFAULT 'none'
                            CHECK (restriction_level IN ('none','warned','cod_restricted','suspended')),
    reason             TEXT,
    updated_by         INTEGER REFERENCES staff_accounts(id),  -- NULL = system-triggered
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 11. INDEXES (performance — does not affect normalization)
-- ============================================================
--
-- This list now INCLUDES the plain and unique indexes that migrations
-- 002, 003, 004, 008, 011, 013 and 019 add, so a database built from
-- this file is fully indexed. The load-bearing PARTIAL unique indexes
-- that enforce invariants are declared inline next to their tables:
--   menu_item_options        -> idx_menu_item_options_active_name, _item
--   inventory_item_categories -> idx_inventory_item_categories_category
--   inventory_transactions   -> idx_inventory_txns_order_item
--   kitchen_alerts           -> idx_kitchen_alerts_one_open_per_order

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_cashier ON orders(cashier_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);  -- migration 002; duplicates idx_order_items_order, harmless
CREATE INDEX idx_payments_order_id ON payments(order_id);        -- migration 002
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_kitchen_alerts_order ON kitchen_alerts(order_id);
CREATE INDEX idx_inventory_txn_item ON inventory_transactions(inventory_item_id);
CREATE INDEX idx_support_chat_messages_chat ON support_chat_messages(chat_id);
CREATE INDEX idx_notifications_staff ON notifications(staff_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_violations_customer ON customer_order_violations(customer_id);
CREATE INDEX idx_violations_created ON customer_order_violations(created_at);

-- Load-bearing unique indexes (not just performance):
CREATE UNIQUE INDEX idx_payments_order_id_unique ON payments (order_id);  -- migration 003: one payment per order
CREATE UNIQUE INDEX idx_esp32_devices_device_code_unique ON esp32_devices (device_code);  -- migration 004

-- Partial indexes on order_items (migrations 008, 011):
CREATE INDEX idx_order_items_option ON order_items (menu_item_option_id) WHERE menu_item_option_id IS NOT NULL;
CREATE INDEX idx_order_items_flavor ON order_items (menu_item_flavor_id) WHERE menu_item_flavor_id IS NOT NULL;

-- Refresh-token family lookup (migration 013):
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);

-- MISSING (see header, "KNOWN GAP"): migration 002's comment assumes this
-- exists to serve the sales report's date-range scan, but nothing creates it.
-- CREATE INDEX idx_orders_created ON orders (created_at DESC);

-- ============================================================
-- END OF SCHEMA
-- ============================================================

-- TABLE USAGE SUMMARY
--
--   [USED]   staff_accounts, otp_verifications, refresh_tokens,
--            menu_categories, menu_items, menu_item_options,
--            menu_item_ingredients, inventory_items,
--            inventory_item_categories, inventory_transactions,
--            orders, order_items, order_status_history, payments,
--            kitchen_alerts, audit_log (write-only; no read endpoint)
--   [PARTIAL] esp32_devices   (read + heartbeat-updated; registration still mock)
--   [UNUSED]  customers, deliveries, chatbot_conversations,
--            chatbot_messages, support_chats, support_chat_messages,
--            notifications,
--            customer_order_violations, customer_restrictions
