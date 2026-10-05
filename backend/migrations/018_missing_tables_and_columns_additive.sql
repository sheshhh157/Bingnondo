-- 018_missing_tables_and_columns_additive.sql
--
-- Bring the dev database forward additively, without touching existing rows,
-- and using idempotent DDL where possible. This adds the tables, columns,
-- constraints, and defaults that exist in the canonical schema
-- (bingnondo_database.sql) but may be missing from a live DB that was created
-- before all of these modules existed. No type of an existing column is
-- altered; only new columns and constraints are introduced.
--
-- Tables that may be absent:
--   customers, deliveries, chatbot_conversations, chatbot_messages,
--   support_chats, support_chat_messages, notifications, audit_log,
--   customer_order_violations, customer_restrictions
--
-- Columns that may be absent:
--   orders.customer_id, payments.paymongo_payment_id
-- widen payments_status_check to include 'failed';
-- ensure orders.status defaults to 'pending'.

-- ------------------------------------------------------------------
-- 1. customers ------------------------------------------------------
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id                SERIAL PRIMARY KEY,
    email             VARCHAR(255) UNIQUE NOT NULL,
    password_hash     VARCHAR(255) NOT NULL,
    email_verified    BOOLEAN DEFAULT FALSE,
    first_name        VARCHAR(50),
    last_name         VARCHAR(50),
    mobile_number     VARCHAR(20) UNIQUE,
    mobile_verified   BOOLEAN DEFAULT FALSE,
    address           TEXT,
    profile_completed BOOLEAN DEFAULT FALSE,
    status            VARCHAR(30) DEFAULT 'awaiting_verification'
                          CHECK (status IN ('awaiting_verification','active','suspended')),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- 2. deliveries ------------------------------------------------------
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deliveries (
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

-- ------------------------------------------------------------------
-- 3. chatbot ----------------------------------------------------------
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chatbot_conversations (
    id          SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    started_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chatbot_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
    sender          VARCHAR(10) NOT NULL CHECK (sender IN ('customer','bot')),
    content         TEXT NOT NULL,
    sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- 4. support_chat ----------------------------------------------------
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_chats (
    id          SERIAL PRIMARY KEY,
    customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id),
    status      VARCHAR(10) DEFAULT 'locked' CHECK (status IN ('unlocked','locked')),
    opened_at   TIMESTAMP,
    locked_at   TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_chat_messages (
    id                SERIAL PRIMARY KEY,
    chat_id           INTEGER NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
    sender_type       VARCHAR(10) NOT NULL CHECK (sender_type IN ('customer','staff')),
    sender_id         INTEGER NOT NULL,
    related_order_id  INTEGER REFERENCES orders(id),
    content           TEXT NOT NULL,
    sent_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- 5. notifications & audit --------------------------------------------
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id            SERIAL PRIMARY KEY,
    staff_id      INTEGER REFERENCES staff_accounts(id),
    target_role   VARCHAR(20),
    type          VARCHAR(50) NOT NULL,
    reference_id  INTEGER,
    is_read       BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          SERIAL PRIMARY KEY,
    actor_id    INTEGER REFERENCES staff_accounts(id),
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id   INTEGER,
    details     JSONB,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- 6. customer violations & restrictions ---------------------------------
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_order_violations (
    id             SERIAL PRIMARY KEY,
    customer_id    INTEGER NOT NULL REFERENCES customers(id),
    order_id       INTEGER NOT NULL REFERENCES orders(id),
    violation_type VARCHAR(30) NOT NULL
                       CHECK (violation_type IN ('cancelled_before_prep','cancelled_after_prep','no_show')),
    flagged_by     INTEGER REFERENCES staff_accounts(id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_restrictions (
    customer_id        INTEGER PRIMARY KEY REFERENCES customers(id),
    restriction_level  VARCHAR(20) NOT NULL DEFAULT 'none'
                            CHECK (restriction_level IN ('none','warned','cod_restricted','suspended')),
    reason             TEXT,
    updated_by         INTEGER REFERENCES staff_accounts(id),
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------
-- 7. missing columns on existing tables ----------------------------------
-- ------------------------------------------------------------------

-- orders.customer_id may not exist yet. Add it and ensure the FK points to
-- the customers table we just created.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

-- payments.paymongo_payment_id may not exist yet.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS paymongo_payment_id VARCHAR(150);

-- Widen the payments status check to include 'failed'.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending','paid','failed','refunded'));

-- Ensure the orders status column defaults to 'pending'.
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pending';
