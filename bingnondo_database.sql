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
-- MIGRATION DRIFT — READ BEFORE USING THIS FILE AS A BASELINE
-- ============================================================
--
-- Two migrations in backend/migrations/ are applied on top of
-- this schema and are NOT represented in the statements below.
-- A database created from this file alone is missing them:
--
--   002_add_order_report_indexes.sql
--     CREATE INDEX idx_order_items_order_id ON order_items (order_id);
--     CREATE INDEX idx_payments_order_id     ON payments  (order_id);
--
--     Note: idx_order_items_order_id duplicates idx_order_items_order
--     in section 11 below. Redundant but harmless — Postgres allows it,
--     and the migration uses IF NOT EXISTS so it is idempotent.
--
--   003_unique_payment_per_order.sql
--     CREATE UNIQUE INDEX idx_payments_order_id_unique
--       ON payments (order_id);
--
--     This one is load-bearing, not just performance. It is what
--     actually enforces the one-payment-row-per-order invariant
--     that payments.order_id UNIQUE below already declares.
--     orders.controller.js resolves "the payment for this order"
--     through a LATERAL subquery (LATEST_PAYMENT_JOIN,
--     orders.controller.js:158) that takes the single latest row, and
--     several reports sum revenue over that join — so a second row
--     would make the figures silently wrong rather than loudly fail.
--
-- KNOWN GAP: 002's header comment says orders is "already covered by
-- idx_orders_created (created_at DESC)". That index is created by
-- neither this file nor any migration in backend/migrations/.
-- The manager sales report's date-range scan is therefore running
-- unindexed until someone adds it:
--
--   CREATE INDEX idx_orders_created ON orders (created_at DESC);
--
-- BROKEN TOOLING: backend/package.json line 10 defines
--   "migrate": "psql $DATABASE_URL -f migrations/001_add_otp_verifications.sql"
-- but migrations/001_add_otp_verifications.sql does not exist.
-- Only 002 and 003 are present. `npm run migrate` currently fails.
-- Apply migrations by hand with psql until that path is corrected.
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
-- NOTE: the role CHECK below is the effective source of truth for the
-- system's roles. It does NOT include 'manager', yet two places in the
-- frontend honor that role: App.jsx:122 gates /manager on
-- ['manager','owner'], and sockets/index.js:42 adds 'manager' to
-- MANAGER_ROLES. A 'manager' row cannot be created in this schema, so that
-- branch is currently unreachable — an owner account is what actually
-- receives the manager room and the /manager routes.
--
-- Staff-side accounts: cashier, kitchen_staff, staff, owner, admin
-- Self-referencing FK: created_by = which Admin created this account
CREATE TABLE staff_accounts (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL
                        CHECK (role IN ('cashier','kitchen_staff','staff','owner','admin')),
    status          VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','deactivated')),
    created_by      INTEGER REFERENCES staff_accounts(id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

-- [USED] inventory_items — read/written by inventory.controller.js.
--
-- IMPORTANT: stock is edited MANUALLY. There is no automatic deduction
-- when an order is confirmed. inventory.controller.js accepts
-- change_type of 'restock', 'deduction' and 'adjustment' through
-- POST /api/inventory/:id/transaction, and the 'deduction' value is
-- only ever reached that way — no order-driven code path calls it.
-- inventory_transactions.reference_order_id is never written, so no
-- row in this table is currently attributable to a specific order.

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
-- (public + staff views, CRUD, availability toggle), orders.controller.js
-- (price lookup and availability check at order time), and
-- inventory.controller.js (cascading is_available when stock changes).
--
-- CASCADE BEHAVIOUR THAT DOES EXIST: POST /api/inventory/:id/out-of-stock
-- forces an ingredient to 0 and flips is_available=false on every menu item
-- linked to it. Restocking re-enables items, excluding those that still have
-- another out-of-stock ingredient. Both broadcast `menu_update`.
CREATE TABLE menu_items (
    id              SERIAL PRIMARY KEY,
    category_id     INTEGER NOT NULL REFERENCES menu_categories(id),
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    price           NUMERIC(10,2) NOT NULL,
    image_url       VARCHAR(500),
    is_available    BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 3NF: category_id references menu_categories rather than storing the
-- category name as text here — avoids a transitive dependency
-- (name -> category_id -> category details).

-- [USED] menu_item_ingredients — read by menu.controller.js for the staff
-- menu view (which ingredients back an item, and their live stock) and
-- written by menu item create/update. It is also what the out-of-stock
-- cascade traverses to find affected menu items.
--
-- Despite the name, this is currently a catalog link, not a consumption log.
-- Nothing decrements through it at order time.

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

-- [USED] inventory_transactions — every stock change is written here by
-- inventory.controller.js, including the 'deduction' rows, but only when a
-- staff member posts one by hand.
--
-- reference_order_id is declared INTEGER and constrained to orders(id) below,
-- but the INSERT in inventory.controller.js omits it entirely, so it is
-- always NULL. There is no automatic deduction on order confirmation.

-- Stock movement log — every restock/deduction/adjustment is its own atomic
-- row (1NF: no repeating "history" column crammed into inventory_items)
CREATE TABLE inventory_transactions (
    id                  SERIAL PRIMARY KEY,
    inventory_item_id   INTEGER NOT NULL REFERENCES inventory_items(id),
    change_type         VARCHAR(20) NOT NULL CHECK (change_type IN ('restock','deduction','adjustment')),
    quantity            NUMERIC(10,2) NOT NULL,
    reference_order_id  INTEGER,   -- nullable; FK added after orders table exists
    performed_by        INTEGER REFERENCES staff_accounts(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
CREATE TABLE order_items (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id  INTEGER NOT NULL REFERENCES menu_items(id),
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(10,2) NOT NULL,
    notes         VARCHAR(255)
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
--                              returned to the caller.
--   method 'gcash'          — returns HTTP 501. PayMongo is not wired up;
--                              processPayment short-circuits before any write.
--   method 'cash_on_delivery' — accepted by the method whitelist but the
--                              order creation path only ever creates 'cash',
--                              and there is no delivery flow to settle it.
--   status 'paid'           — set manually by the cashier action above.
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
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 6. KITCHEN & ESP32
-- ============================================================

-- [PARTIAL] esp32_devices — READ ONLY. kitchen.controller.js LEFT JOINs this
-- table when listing kitchen alerts, but nothing in the backend ever INSERTs
-- or UPDATEs a row. The Admin device-registration UI writes to an in-memory
-- MOCK_DEVICES array in frontend/src/services/api.js, so registrations do
-- not survive a reload and never reach this table.
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

-- [PARTIAL] kitchen_alerts — READ AND ACKNOWLEDGED, NEVER CREATED.
-- kitchen.controller.js lists these rows and can set acknowledged_at /
-- acknowledged_by, but there is no INSERT INTO kitchen_alerts anywhere in
-- backend/. The table stays empty in practice, so GET /api/kitchen/alerts
-- returns nothing and no physical buzzer is ever triggered.
--
-- The socket emitters emitKitchenAlert() and emitKitchenAlertAck() in
-- sockets/index.js are fully written and would work, but nothing calls them.
-- Completing this needs an alert INSERT on order creation, plus the ESP32
-- device registration and handshake auth noted above.

CREATE TABLE kitchen_alerts (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    device_id       INTEGER NOT NULL REFERENCES esp32_devices(id),
    triggered_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    acknowledged_by INTEGER REFERENCES staff_accounts(id)
);

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

-- [UNUSED] notifications, audit_log — no backend exists. The Admin Audit Log
-- page and its action filters are built in the frontend, but they read a
-- local in-memory array that addAuditEntry() appends to on every mocked
-- admin action, in frontend/src/services/api.js. Nothing is persisted, and
-- no INSERT into audit_log exists in backend/.

CREATE TABLE notifications (
    id            SERIAL PRIMARY KEY,
    staff_id      INTEGER REFERENCES staff_accounts(id),  -- NULL = broadcast to a role
    target_role   VARCHAR(20),
    type          VARCHAR(50) NOT NULL,
    reference_id  INTEGER,
    is_read       BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
-- Reminder from the header: backend/migrations/002 and 003 add further
-- indexes on top of this list, including the load-bearing
-- idx_payments_order_id_unique that enforces one payment per order.
-- This list alone does not produce a fully indexed database.

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_cashier ON orders(cashier_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_kitchen_alerts_order ON kitchen_alerts(order_id);
CREATE INDEX idx_inventory_txn_item ON inventory_transactions(inventory_item_id);
CREATE INDEX idx_support_chat_messages_chat ON support_chat_messages(chat_id);
CREATE INDEX idx_notifications_staff ON notifications(staff_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_violations_customer ON customer_order_violations(customer_id);
CREATE INDEX idx_violations_created ON customer_order_violations(created_at);

-- MISSING (see header, "KNOWN GAP"): migration 002's comment assumes this
-- exists to serve the sales report's date-range scan, but nothing creates it.
-- CREATE INDEX idx_orders_created ON orders (created_at DESC);

-- ============================================================
-- END OF SCHEMA
-- ============================================================

-- TABLE USAGE SUMMARY
--
--   [USED]   staff_accounts, otp_verifications, menu_categories,
--            menu_items, menu_item_ingredients, inventory_items,
--            inventory_transactions, orders, order_items,
--            order_status_history, payments
--   [PARTIAL] esp32_devices, kitchen_alerts        (read-only; no writes)
--   [UNUSED]  customers, deliveries, chatbot_conversations,
--            chatbot_messages, support_chats, support_chat_messages,
--            notifications, audit_log,
--            customer_order_violations, customer_restrictions
