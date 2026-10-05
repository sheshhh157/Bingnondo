# Bingnondo Cafe System — Technical Architecture & Design

> Development of a Mobile and Web-Based Food Ordering and Business Management System with AI Chatbot and ESP32 Kitchen Alert Integration for Bingnondo Cafe

> **Scope note.** This document describes the system **as built**, and marks planned-but-absent work explicitly (see §2a). Sections annotated "As built", "Not implemented" or "Inert" are reconciled against the code; everything else is a statement of design intent that the current code does support. Companion documents: `bingnondo_flow.md` (screen-by-screen and per-endpoint flows) and `bingnondo_database.sql` (the authoritative DDL, with per-table usage markers).

---

## 1. Overview

**Architecture decisions:**

- **Pattern:** Modular Monolith — single backend repo, clear module boundaries (ordering, kitchen, POS, inventory, payments, auth). The design also called for delivery, chatbot, chat, analytics and admin, but those modules are not implemented yet.
- **Backend:** Node.js + Express — RESTful API with per-module `*.routes.js` and controllers (entrypoint `backend/server.js`, no top-level `src/app.js`). Uses raw `pg` with parameterized SQL and manual transactions; no ORM is used.
- **Frontend (Web):** React 19 (Vite) SPA — role-based dashboards (Cashier, Kitchen, Staff, Owner/Admin and Manager), route-guarded by role.
- **Mobile:** Planned (separate repo, Flutter). No Flutter app is present in this repository.
- **Database:** PostgreSQL — normalized schema (3NF). Several tables are defined but unused (see Implementation Status below).
- **Real-time:** Socket.io — order updates, kitchen/manager rooms, menu availability and inventory updates. The `manager` room is the only one guarded by handshake token (derived from JWT); other rooms rely on client-side `join` emits.
- **Hardware:** ESP32 — the buzzer path is live: a `kitchen_alerts` row is created and `kitchen_alert` is emitted when a counter order is paid. Device *registration* is still not persisted (no backend INSERT path) and there is no handshake token validation; the ESP32 heartbeat updates `esp32_devices.status` / `last_ping_at`.
- **Payments:** Cash is implemented. GCash via PayMongo returns 501 in the current backend; the webhook endpoint is stubbed (log-only) and does not update payment status.
- **AI Chatbot:** Not implemented.
- **Auth:** JWT (access ~30m, refresh ~7d), bcrypt (cost 12), OTP stored in `otp_verifications` (currently plaintext). Refresh tokens are tracked server-side in `refresh_tokens` (hash + family, for rotation and revocation). Customer registration/profile completion does not exist — only staff authentication is implemented.
- **File storage:** Not implemented yet.

**Data ownership principle:**

- One unified PostgreSQL schema — this is a single merged system, not a multi-team split like a marketplace clone, so there is no cross-module API boundary needed internally.
- The intended external boundaries are the ESP32 device and third-party APIs (PayMongo, OpenAI/Gemini). In practice only SMTP (nodemailer, for staff OTP) is wired up today. The ESP32 WebSocket and the PayMongo webhook exist but are unauthenticated — see §8.
- Role-based access control (RBAC) is enforced at the middleware level per route, not by separate schemas.

---

## 2. Roles & Access Summary

| Role | Platform | Primary Responsibility |
|---|---|---|
| **Customer** | Mobile App (_planned_) | Browse menu, order online, pay, chat with AI/staff, track order (not implemented in this codebase) |
| **Cashier** | Web | Process walk-in/counter orders, accept payment (cash only today) |
| **Kitchen Staff** | Web | View incoming orders, mark orders preparing/ready; ESP32 alert panel is live (alerts are created on payment) |
| **Staff** | Web | Manage inventory, menu availability (delivery and support chat UI are mock-only today) |
| **Owner/Manager** | Web | View analytics/sales dashboard via the Manager area (read-only; some pages depend on mocks) |
| **Admin** | Web | Admin UI exists for accounts/settings/audit/restrictions but all calls use in-memory mocks — no `/api/admin/*` endpoints on the backend. |

**Note on roles:** The schema's role `CHECK` allows `cashier`, `kitchen_staff`, `staff`, `owner`, `admin`, `manager` (migration 017 added `manager` to the role list and `suspended` to the status list). The frontend (`App.jsx:122`) gates `/manager` on `['manager','owner']` and the socket hub (`sockets/index.js:42`) admits `manager` to the manager room, so a `manager` account is now producible and reaches those surfaces.

---

## 2a. Implementation Status

| Area | Status | Notes |
|---|---|---|
| Auth (staff) | Built | `/api/auth/staff/login`, forgot/reset password, refresh, logout, `/me`. Customer auth not implemented. |
| Menu | Built | Public menu, staff-enriched menu with ingredients, category CRUD, availability toggle. Emits `menu_update` on changes. |
| Inventory | Built | List, get by ID, create/patch/delete ingredient, manual transactions (`restock/adjustment/deduction`), `out-of-stock` cascade, plus **automatic deduction on cash payment** (`deductInventory()` writes `deduction` rows with `reference_order_id`). |
| Orders | Built | Create counter order (`pending`), list/report/totals, get by ID, update status, cancel, edit items. |
| Payments | Partial | Cash works; `gcash` returns 501, webhook is log-only stub. `payments.order_id` uniqueness enforced at DB level. |
| Kitchen | Built | Kitchen queue, acknowledge and move `preparing`/`ready`. `kitchen_alerts` is inserted on cash payment (one open alert per order, enforced by a partial unique index). |
| Sockets | Built | Rooms cashier/kitchen/staff/manager/esp32:<id>; manager is handshake-authenticated. |
| Manager Dashboard | Built | Real `/api/orders/totals` and `/api/orders/report`, uses `managerApi.js` with bounded limits. |
| Admin UI/API | Mock-only | Frontend pages exist, backed by in-memory `MOCK_*` in `services/api.js`; no `/api/admin/*` routes. |
| Deliveries | Not built | Tables/routes/controllers missing; frontend page is mock-only. |
| Chatbot (AI) | Not built | Tables defined, no implementation. |
| Support Chat | Mock-only | Frontend has threads/messages UI, backed by mocks. |
| Analytics | Not built | Manager uses report/totals; no separate `/api/analytics/*` endpoints. |
| Notifications/Audit | Partial | `notifications` has no backend. `audit_log` **is written** (failed logins, payments, menu updates, order cancels, auto-cancels) but has no read endpoint — the Admin Audit Log page is still mock-backed. |
| Customer (mobile) | Not built | No customer tables/routes used, no Flutter code in repo. |
| ESP32 | Partial | `GET /api/esp32/alert` polling is live and the buzzer fires on paid orders; the heartbeat updates `esp32_devices`. Device registration not persisted, no handshake auth. |

---

## 3. Repository & Folder Structure

The intended layout is two repositories: a **monorepo** for backend + web frontend (deployed as two separate services from the same repo), and a **separate repo** for the Flutter mobile app (published independently to Google Play). Only the monorepo exists today.

### 3.1 Repo 1 — `bingnondo-system` (Backend + Web, monorepo) — *intended tree*

```
bingnondo-system/
├── backend/
│   ├── src/
│   │   ├── config/            # env config, DB connection, Socket.io setup
│   │   ├── modules/
│   │   │   ├── auth/          # customer + staff auth, OTP, JWT
│   │   │   ├── menu/          # menu items, categories
│   │   │   ├── inventory/     # stock, ingredients, deduction logic
│   │   │   ├── orders/        # order creation, status transitions
│   │   │   ├── delivery/      # own delivery + Lalamove assignment
│   │   │   ├── payments/      # PayMongo integration + webhook handler
│   │   │   ├── kitchen/       # kitchen display + ESP32 alert logic
│   │   │   ├── chatbot/       # OpenAI/Gemini integration
│   │   │   ├── chat/          # customer–staff support chat
│   │   │   ├── analytics/     # sales/reporting queries
│   │   │   └── admin/         # staff account mgmt, system settings, audit log
│   │   ├── middleware/        # auth guard, role check, error handler
│   │   ├── sockets/           # Socket.io event handlers/namespaces
│   │   ├── routes/            # route definitions per module
│   │   └── app.js
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── cashier/
│   │   │   ├── kitchen/
│   │   │   ├── staff/
│   │   │   ├── owner/
│   │   │   └── admin/
│   │   ├── components/        # shared UI components
│   │   ├── context/            # auth context, role-based routing
│   │   ├── services/           # API calls, Socket.io client
│   │   └── App.jsx
│   ├── package.json
│   └── .env
│
└── README.md
```

- Backend deployed separately (e.g. Railway/Render) — `/backend` as the deploy root
- Frontend deployed separately (e.g. Vercel/Netlify) — `/frontend` as the deploy root
- Same repo, same version history, but independently deployable — this is what keeps Socket.io on a real persistent server while the frontend stays on static hosting

### 3.1a As Built (deviations from the layout above)

The original tree above does not match the current repository. In practice:

```
bingnondo-system/
├── backend/
│   ├── server.js                  # entrypoint — mounts all routes, Socket.io, rate limits
│   ├── src/
│   │   ├── config/db.js           # pg Pool + query()/getClient() helpers
│   │   ├── middleware/            # auth.middleware.js, rate-limit.middleware.js
│   │   ├── modules/
│   │   │   ├── auth/              # *.controller, *.routes, auth.jwt.js, auth.otp.js
│   │   │   ├── menu/
│   │   │   ├── inventory/
│   │   │   ├── orders/            # incl. status-transitions.js (single source of truth)
│   │   │   ├── payments/
│   │   │   └── kitchen/
│   │   ├── sockets/index.js       # Socket.io hub + emitter helpers
│   │   └── utils/mailer.js        # nodemailer for OTP delivery
│   ├── migrations/                # 002–023 (now folded into bingnondo_database.sql)
│   ├── test/                      # node:test suites for order status and report
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/                 # cashier, kitchen, staff, admin, manager, auth
│   │   ├── context/               # AuthContext, SocketContext, ToastContext
│   │   ├── services/              # apiClient (HTTP), api.js (incl. MOCK_*), socket.js
│   │   ├── components/, hooks/, utils/
│   │   └── App.jsx                # route table with per-role ProtectedRoute
│   └── package.json
├── bingnondo_architecture_design.md
├── bingnondo_flow.md
└── bingnondo_database.sql
```

Notes:
- There is no `src/app.js` and no top-level `src/routes/`; each module owns its `*.routes.js`.
- `modules/orders/status-transitions.js` holds the only definition of legal status transitions, shared by the orders and kitchen controllers so the two cannot drift.
- `frontend/package.json` is named `manager-dashboard` — the app grew from a manager-only view into the full role-based web app.
- `npm test` in `backend/` runs `node --test "test/**/*.test.js"`.

### 3.2 Repo 2 — `bingnondo-mobile` (Flutter, separate repo) — **does not exist**

```
bingnondo-mobile/
├── lib/
│   ├── screens/
│   │   ├── auth/
│   │   ├── menu/
│   │   ├── cart_checkout/
│   │   ├── order_tracking/
│   │   ├── chatbot/
│   │   ├── support_chat/
│   │   └── account/
│   ├── services/               # API client, Socket.io client
│   ├── models/
│   └── main.dart
├── pubspec.yaml
└── README.md
```

- Backend URL kept as an environment variable/build config — never hardcoded — so the APK doesn't need a rebuild if the backend URL changes
- Published independently to Google Play; only talks to Repo 1's backend via REST + Socket.io

> No Flutter source exists in this repository — no `pubspec.yaml`, no `.dart` files. The only customer-facing endpoint that is live is `GET /api/menu`, and it is public, so the cashier POS uses it.

**Bakit ganito ang split (ulit ng napag-usapan natin):**
- Isang buong "system" pero magkaiba ang deployment requirements ng bawat piraso — backend kailangan ng persistent server (Socket.io/WebSocket), frontend static lang, mobile published sa Play Store on its own release cycle.
- Monorepo para sa backend+frontend kasi magkasabay silang gina-develop at gina-version, pero deployed separately.
- Mobile hiwalay talaga dahil sa Play Store release cycle — hindi siya kasabay ng web deploys.

---

## 4. Database Schema (PostgreSQL, 3NF)

**3NF principle applied throughout:**
- Every non-key attribute depends on the whole primary key (no partial dependencies).
- No transitive dependencies (attributes depending on other non-key attributes).
- Repeating groups (order items, images, ingredients) extracted into their own tables.

**Status markers.** Sections marked "not implemented" define intended tables for modules with no backend code. They are kept here because the schema file is the intended full design, but nothing in `backend/` reads or writes them. See §2a for the per-area status.

**How this section relates to `bingnondo_database.sql`:** the DDL below is the intended schema and matches the SQL file, which is the authoritative copy. The SQL file already folds in every migration (`backend/migrations/002`–`023`), so the migration additions — `menu_item_options`, `inventory_item_categories`, `refresh_tokens`, `archived_at`, the option/flavor columns, `cash_given`/`change_given`, the new CHECK values and the added indexes — are all included in the DDL here. The `003` unique index is what enforces the one-payment-per-order invariant.

**Schema usage today** (see `bingnondo_database.sql` header for the full table):
- **Used:** `staff_accounts`, `otp_verifications`, `refresh_tokens`, `menu_categories`, `menu_items`, `menu_item_options`, `menu_item_ingredients`, `inventory_items`, `inventory_item_categories`, `inventory_transactions`, `orders`, `order_items`, `order_status_history`, `payments`, `kitchen_alerts`, and `audit_log` (write-only — see §4.10).
- **Partially wired:** `esp32_devices` (read by the alert path and updated by the ESP32 heartbeat; registration INSERT is still mock-only).
- **Defined but unused:** `customers`, `deliveries`, `chatbot_conversations`, `chatbot_messages`, `support_chats`, `support_chat_messages`, `notifications`, `customer_order_violations`, `customer_restrictions`.

**Additional index note:** the manager report queries `orders` by date range, but the `idx_orders_created (created_at DESC)` index assumed by `migrations/002` is not created by the schema or by any migration. Until it is added, that scan runs unindexed.

---

### 4.1 Accounts & Auth

> **As built:** only `staff_accounts`, `otp_verifications` and `refresh_tokens` are in use (staff login, password reset, and the server-side refresh-token registry used for rotation/revocation). `customers` and its progressive two-stage registration are not implemented — there are no customer auth routes.

```sql
-- Customers (self-registered, mobile app only)
-- Progressive registration: sign-up requires only email + password + OTP.
-- Profile fields (name, mobile, address) are collected in a separate
-- "Complete Profile" step, GATED before the customer can place a first
-- order — profile_completed enforces this at the API level.
CREATE TABLE customers (
    id                SERIAL PRIMARY KEY,
    email             VARCHAR(255) UNIQUE NOT NULL,
    password_hash     VARCHAR(255) NOT NULL,
    email_verified    BOOLEAN DEFAULT FALSE,
    first_name        VARCHAR(50),               -- filled in during profile completion
    last_name         VARCHAR(50),               -- filled in during profile completion
    mobile_number     VARCHAR(20) UNIQUE,         -- nullable until profile completion
    mobile_verified   BOOLEAN DEFAULT FALSE,
    address           TEXT,                       -- filled in during profile completion
    profile_completed BOOLEAN DEFAULT FALSE,      -- must be TRUE before an order can be placed
    status            VARCHAR(30) DEFAULT 'awaiting_verification'
                          CHECK (status IN ('awaiting_verification','active','suspended')),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 3NF note: first_name/last_name/mobile_number/address are nullable by
-- design (two-stage sign-up), not a normalization gap — every column
-- still describes only the customer identified by id.

-- Staff-side accounts: cashier, kitchen_staff, staff, owner, admin, manager
-- Created by Admin only — no self-signup. (Migration 017 added
-- 'manager' to the role CHECK and 'suspended' to the status CHECK.)
CREATE TABLE staff_accounts (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL
                        CHECK (role IN ('cashier','kitchen_staff','staff','owner','admin','manager')),
    status          VARCHAR(20) DEFAULT 'active'
                        CHECK (status IN ('active','deactivated','suspended')),
    created_by       INTEGER REFERENCES staff_accounts(id), -- admin who created this account
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Server-side refresh-token registry (migration 013). auth.controller.js
-- inserts a row on login, looks the token up by hash on refresh, revokes
-- the whole family_id line when a reused token is detected, and marks
-- rotated rows replaced_by. Keeping only the hash server-side makes a
-- stolen refresh token useless against the database.
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

-- OTP codes (shared table — separate from customers to avoid transitive dependency)
CREATE TABLE otp_verifications (
    id          SERIAL PRIMARY KEY,
    contact     VARCHAR(255) NOT NULL,   -- email or mobile number
    otp_code    VARCHAR(6) NOT NULL,
    purpose     VARCHAR(30) NOT NULL
                    CHECK (purpose IN ('email_verification','mobile_verification','password_reset')),
    expires_at  TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.2 Menu, Inventory & Availability

```sql
CREATE TABLE menu_categories (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE menu_items (
    id              SERIAL PRIMARY KEY,
    category_id     INTEGER NOT NULL REFERENCES menu_categories(id),
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    price           NUMERIC(10,2) NOT NULL,
    image_url       VARCHAR(500),
    is_available    BOOLEAN DEFAULT TRUE,   -- auto-toggled when linked inventory hits 0
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at     TIMESTAMPTZ             -- migration 007: soft delete; row kept so past order_items keep resolving
);

-- Sellable variants of a menu item (migrations 008, 009, 011) — e.g. the
-- "Coffee is Hot or Iced" case. A child table rather than two menu_items
-- rows: two rows would mean two names, two photos, two ingredient links
-- and two availability toggles to keep in sync.
--
-- option_kind (migration 011) splits options into 'variant' (a form of the
-- item: Hot/Iced, Solo/Sharing) and 'flavor' (an add-on, e.g. Adobo). A
-- single order line can carry BOTH, and their prices stack. Each option has
-- an ABSOLUTE price (not a delta), so the authoritative figure never drifts;
-- menu_items.price stays the "from" price for an item that has options.
--
-- Archived, not deleted: order_items holds a hard FK (NO ACTION) to
-- menu_item_options(id) with no name snapshot, so removing a row would
-- orphan old receipts. The partial unique index lets the name be reused
-- once the row is archived, while the archived row stays so receipts resolve.
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
-- One live row per (menu_item_id, name). PARTIAL so archived rows don't
-- block re-adding the same name.
CREATE UNIQUE INDEX idx_menu_item_options_active_name
    ON menu_item_options (menu_item_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_menu_item_options_item
    ON menu_item_options (menu_item_id) WHERE archived_at IS NULL;

-- Raw ingredient/stock records
CREATE TABLE inventory_items (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) UNIQUE NOT NULL,
    unit            VARCHAR(20) NOT NULL,     -- kg, pcs, liters, etc.
    current_stock   NUMERIC(10,2) NOT NULL DEFAULT 0,
    reorder_level   NUMERIC(10,2) DEFAULT 0,  -- triggers low-stock alert
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bill of materials: which ingredients + how much a menu item consumes
-- (junction table — 3NF: avoids many-valued attribute on menu_items)
CREATE TABLE menu_item_ingredients (
    menu_item_id      INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity_required NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (menu_item_id, inventory_item_id)
);

-- Lets an ingredient carry the same categories the menu uses, and more than
-- one at a time (migration 010). Reuses menu_categories rather than adding a
-- second category table. A join table (not a category_id column) because an
-- ingredient can belong to several categories at once.
CREATE TABLE inventory_item_categories (
    inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    menu_category_id  INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (inventory_item_id, menu_category_id)
);
CREATE INDEX idx_inventory_item_categories_category
    ON inventory_item_categories (menu_category_id);

-- Stock movement log (every deduction/restock is an atomic row — no transitive deps).
-- Written by two paths: manual (inventory.controller.js, reference_order_id
-- NULL) and automatic (payments.controller.js deductInventory() on a paid
-- cash order, reference_order_id = the order id). The FK is ON DELETE
-- RESTRICT (migrations 015→016): an ingredient cannot be deleted while it
-- still has movement history.
CREATE TABLE inventory_transactions (
    id                  SERIAL PRIMARY KEY,
    inventory_item_id   INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    change_type         VARCHAR(20) NOT NULL CHECK (change_type IN ('restock','deduction','adjustment')),
    quantity            NUMERIC(10,2) NOT NULL,
    reference_order_id  INTEGER, -- NULL for manual moves; the order id for payment deductions
    performed_by        INTEGER REFERENCES staff_accounts(id),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- One deduction row per (order, ingredient). PARTIAL: only 'deduction' rows
-- that carry a reference_order_id, so manual restock/adjustment rows are
-- unrestricted. Makes payment-time deduction idempotent.
CREATE UNIQUE INDEX idx_inventory_txns_order_item
    ON inventory_transactions (reference_order_id, inventory_item_id)
    WHERE change_type = 'deduction' AND reference_order_id IS NOT NULL;
```

**Sync logic (as built):** stock moves on **two** paths. (1) **Manual** — `POST /api/inventory/:id/transaction` accepts `restock`, `adjustment` or `deduction` (these leave `reference_order_id` NULL). (2) **Automatic** — when a cash payment succeeds, `payments.controller.js deductInventory()` writes one `deduction` row per consumed ingredient, carrying `reference_order_id` (the paid order's id), and decrements `inventory_items.current_stock`; a partial unique index makes this idempotent so a retried payment cannot double-deduct. Separately, `POST /api/inventory/:id/out-of-stock` forces an ingredient to 0 and sets `menu_items.is_available = FALSE` for every item linked to it, and a restock re-enables items that have no other out-of-stock ingredient. Both paths broadcast `menu_update` so the availability badge updates without a reload.

---

### 4.3 Orders

```sql
CREATE TABLE orders (
    id              SERIAL PRIMARY KEY,
    order_type      VARCHAR(10) NOT NULL CHECK (order_type IN ('online','counter')),
    customer_id     INTEGER REFERENCES customers(id),       -- NULL for counter orders
    cashier_id      INTEGER REFERENCES staff_accounts(id),  -- NULL for online orders
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','preparing','ready',
                                           'out_for_delivery','completed','cancelled')),
    order_channel   VARCHAR(20) NOT NULL, -- 'mobile_app' or 'web_counter'
    total_amount    NUMERIC(10,2) NOT NULL,
    special_request TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order line items (repeating group extracted — 3NF).
-- menu_item_option_id / menu_item_flavor_id (migrations 008, 011) record
-- WHICH variant and WHICH flavor were sold on this line, so a receipt can
-- still name them after the option row is archived. Both are NULL for items
-- with no options; a single line can carry both (their prices stack). The
-- FKs are NO ACTION (not CASCADE): archiving keeps the row, so the variant
-- name on an old receipt keeps resolving.
CREATE TABLE order_items (
    id                   SERIAL PRIMARY KEY,
    order_id             INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id         INTEGER NOT NULL REFERENCES menu_items(id),
    menu_item_option_id  INTEGER REFERENCES menu_item_options(id),
    menu_item_flavor_id  INTEGER REFERENCES menu_item_options(id),
    quantity             INTEGER NOT NULL CHECK (quantity > 0),
    unit_price           NUMERIC(10,2) NOT NULL,  -- price snapshot at time of order
    notes                VARCHAR(255)
);

-- Status change history (audit trail per order)
CREATE TABLE order_status_history (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL,
    changed_by  INTEGER REFERENCES staff_accounts(id),
    changed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4.4 Delivery

> **Not implemented.** No `deliveries` module, controller or route exists. `frontend/src/services/managerApi.js:189` returns a hardcoded empty array and the Staff Delivery page renders from mocks.

```sql
CREATE TABLE deliveries (
    id                   SERIAL PRIMARY KEY,
    order_id             INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    delivery_preference  VARCHAR(20) NOT NULL CHECK (delivery_preference IN ('own_delivery','lalamove')),
    assigned_by          INTEGER REFERENCES staff_accounts(id), -- staff who confirmed/assigned
    rider_name           VARCHAR(100),        -- used for own_delivery
    rider_contact        VARCHAR(20),
    lalamove_booking_id  VARCHAR(100),        -- used when delivery_preference = 'lalamove'
    status               VARCHAR(20) DEFAULT 'pending_assignment'
                             CHECK (status IN ('pending_assignment','assigned','out_for_delivery',
                                                'delivered','cancelled')),
    assigned_at          TIMESTAMP,
    delivered_at         TIMESTAMP
);
```

**Cancellation rule:** An order may be cancelled by the customer only while `deliveries.status` is `pending_assignment`. Once `status = out_for_delivery` (rider has the order), cancellation is disabled at the API level.

---

### 4.5 Payments (PayMongo)

> **As built:** cash only. `gcash` returns HTTP 501 (`payments.controller.js:26`) and the webhook is a log-only stub. The table and the one-payment-per-order invariant are in place, but the GCash path is not wired.

```sql
CREATE TABLE payments (
    id                  SERIAL PRIMARY KEY,
    order_id            INTEGER UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method              VARCHAR(20) NOT NULL CHECK (method IN ('gcash','cash','cash_on_delivery')),
    amount              NUMERIC(10,2) NOT NULL,
    paymongo_payment_id VARCHAR(150),   -- NULL for cash/COD
    status              VARCHAR(20) DEFAULT 'pending'
                            CHECK (status IN ('pending','paid','failed','refunded')),
    paid_at             TIMESTAMP,
    cash_given          NUMERIC(10,2),  -- migration 021: tendered amount (cash)
    change_given        NUMERIC(10,2),  -- migration 021: change returned
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Intended flow:** GCash payments create a PayMongo payment intent/source; PayMongo sends a webhook to `POST /api/webhooks/paymongo` which updates `status` and, on success, confirms the order.

**As built:** one `payments` row is created per order at creation time with `method='cash'`, `status='pending'`. The cashier then calls `POST /api/payments` to mark it `paid`, recording `cash_given` and `change_given`. Inside the same transaction the payment also: runs `deductInventory()` (writes the `deduction` inventory rows and decrements stock — see §4.2), resolves the target ESP32 device by `device_code`, inserts a `kitchen_alerts` row, and writes an `audit_log` entry (`payment_paid`). After COMMIT it emits `new_order`(kitchen) + `order:new`(manager), one `inventory:update` per deducted ingredient, and `kitchen_alert`. So **payment — not order creation — is what promotes a counter order to the kitchen and fires the buzzer**. `gcash` returns 501; `cash_on_delivery` is accepted by the method whitelist but never created by the order path and has no delivery flow to settle it. The webhook handler logs the event type and returns `{received:true}` without a signature check or a write — so `server.js:55`'s comment about a signed webhook describes intent, not current behaviour. Payment is refused (409) for a cancelled or already-paid order, under a row lock shared with the cancel path so the two cannot interleave.

---

### 4.6 Kitchen & ESP32

> **As built:** the kitchen queue and status endpoints are live. A `kitchen_alerts` row **is** created — one per paid cash order, inserted by `payments.controller.js`, which then emits `kitchen_alert` — so the alert panel has data and the buzzer fires when an order is paid. `esp32_devices` is read by the alert path and updated by the heartbeat, but device *registration* is still mock-only. The `kitchen_alert` and `kitchen_alert:ack` emitters are now live.

```sql
CREATE TABLE esp32_devices (
    id            SERIAL PRIMARY KEY,
    device_code   VARCHAR(50) UNIQUE NOT NULL,  -- physical device identifier
    location_label VARCHAR(100),                -- e.g. "Kitchen Station 1"
    status        VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online','offline')),
    last_ping_at  TIMESTAMP
);

CREATE TABLE kitchen_alerts (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    device_id    INTEGER NOT NULL REFERENCES esp32_devices(id),
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,      -- set when kitchen staff dismisses alert on web display
    acknowledged_by INTEGER REFERENCES staff_accounts(id)
);
```

---

### 4.7 AI Chatbot

> **Not implemented.** No OpenAI/Gemini client, route or controller exists.

```sql
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
```

**Integration note:** Each request to the OpenAI/Gemini API is sent with a system prompt built dynamically from the live `menu_items` (name, price, availability) and a static FAQ block, scoping the model to menu/availability answers only.

---

### 4.8 Customer–Staff Support Chat

> **Not implemented on the backend.** The staff Support Chat page is fully built in the frontend but reads from in-memory `MOCK_CHAT_THREADS` / `MOCK_CHAT_MESSAGES` in `services/api.js`.

```sql
-- One thread per customer (not per order) — unlocked while ≥1 active order exists
CREATE TABLE support_chats (
    id          SERIAL PRIMARY KEY,
    customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id),
    status      VARCHAR(10) DEFAULT 'locked' CHECK (status IN ('unlocked','locked')),
    opened_at   TIMESTAMP,
    locked_at   TIMESTAMP
);

CREATE TABLE support_chat_messages (
    id             SERIAL PRIMARY KEY,
    chat_id        INTEGER NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
    sender_type    VARCHAR(10) NOT NULL CHECK (sender_type IN ('customer','staff')),
    sender_id      INTEGER NOT NULL,   -- customer_id or staff_accounts.id depending on sender_type
    related_order_id INTEGER REFERENCES orders(id), -- optional reference tag on the message
    content        TEXT NOT NULL,
    sent_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Unlock/lock rule:** `support_chats.status` is set to `unlocked` the moment a customer has at least one order not in `completed`/`cancelled`. It flips back to `locked` when none of the customer's orders are active. Enforced server-side on every order status transition, not client-side.

---

### 4.9 Analytics (derived, no separate storage needed)

Sales and performance data is computed on read from `orders`, `order_items`, and `payments` — no duplicate summary tables required at this scale.

**As built:** there is no `/api/analytics/*` module. The Manager dashboard uses `GET /api/orders/totals` (one-row revenue aggregate) and `GET /api/orders/report` (range-bucketed revenue, best sellers, counts), both in `orders.controller.js`. The report accepts the browser's IANA timezone so day boundaries match the pickers rather than the server's zone. Reads are bounded — the manager pages no longer request `limit=10000` and aggregate client-side, though the backend still clamps any single read at that ceiling.

---

### 4.10 Notifications & Audit

> **Partially implemented.** The `audit_log` table **is** written by six real code paths — failed staff logins (`auth.controller.js`), payments (`payments.controller.js`), menu updates and availability toggles (`menu.controller.js`), order cancels (`orders.controller.js`) and the scheduler's auto-cancel (`scheduler.js`). But it is **write-only**: no endpoint reads it (there is no `FROM audit_log` anywhere and no `/api/audit` route). The Admin Audit Log page still filters a local array that `addAuditEntry()` appends to as a side effect of mocked admin actions, so the page does not reflect the persisted rows. `notifications` has no backend.

```sql
CREATE TABLE notifications (
    id            SERIAL PRIMARY KEY,
    staff_id      INTEGER REFERENCES staff_accounts(id), -- NULL = broadcast to a role
    target_role   VARCHAR(20), -- used when staff_id is NULL
    type          VARCHAR(50) NOT NULL,  -- 'new_order','low_stock','new_message', etc.
    reference_id  INTEGER,               -- order_id, inventory_item_id, chat_id, etc.
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
```

---

### 4.11 Customer Order Violations & Restrictions

> **Not implemented.** No backend writes to these tables — `POST /api/orders/:id/cancel` does not record a violation — and the Admin Customer Restrictions page is mock-backed.

```sql
-- Tracks each cancellation/no-show incident per customer (one row per incident)
CREATE TABLE customer_order_violations (
    id             SERIAL PRIMARY KEY,
    customer_id    INTEGER NOT NULL REFERENCES customers(id),
    order_id       INTEGER NOT NULL REFERENCES orders(id),
    violation_type VARCHAR(30) NOT NULL
                       CHECK (violation_type IN ('cancelled_before_prep','cancelled_after_prep','no_show')),
    flagged_by     INTEGER REFERENCES staff_accounts(id), -- NULL if system-triggered (customer-initiated cancel)
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Current restriction state per customer (1:1 extension of customers)
CREATE TABLE customer_restrictions (
    customer_id        INTEGER PRIMARY KEY REFERENCES customers(id),
    restriction_level  VARCHAR(20) NOT NULL DEFAULT 'none'
                            CHECK (restriction_level IN ('none','warned','cod_restricted','suspended')),
    reason             TEXT,
    updated_by         INTEGER REFERENCES staff_accounts(id), -- NULL if system-triggered
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose:** Discourage fake/prank orders without requiring ID collection (which would trigger Data Privacy Act obligations disproportionate to a cafe ordering app). Uses a graduated, auditable response instead of an immediate ban.

**Logic (rolling 30-day window):**

| Violation count | System action |
|---|---|
| 1st | Logged only, no customer-facing action |
| 2nd | In-app warning shown to customer |
| 3rd | `restriction_level = cod_restricted` — Cash on Delivery hidden at checkout, GCash-only |
| 4th+ | `restriction_level = suspended` — order placement blocked, must contact Admin/Owner |

- `customer_order_violations` keeps full incident history; `customer_restrictions` keeps only current state, so checkout only needs one fast lookup.
- Admin/Owner can manually override/lift a restriction — recorded via `updated_by`, distinct from `NULL` (system-triggered) for auditability.
- This table set stays separate from `audit_log` because these are business-rule events on a customer, not staff actions on the system.

---

## 5. Relationships Summary (3NF Verification)

All rows below describe the intended normalized design. Whether each table is actually read by the running backend is tracked separately — see the table usage summary in §4 and the header of `bingnondo_database.sql`.

| Table | Primary Key | Non-key attributes depend on | 3NF |
|---|---|---|---|
| customers | id | id only | ✓ |
| staff_accounts | id | id only (created_by self-FK) | ✓ |
| refresh_tokens | id | staff_account_id (FK) | ✓ |
| otp_verifications | id | contact + purpose | ✓ |
| menu_categories | id | id only | ✓ |
| menu_items | id | category_id (FK) | ✓ |
| menu_item_options | id | menu_item_id (FK) | ✓ |
| inventory_items | id | id only | ✓ |
| inventory_item_categories | (inventory_item_id, menu_category_id) | composite key only | ✓ |
| menu_item_ingredients | (menu_item_id, inventory_item_id) | composite key only | ✓ |
| inventory_transactions | id | inventory_item_id | ✓ |
| orders | id | customer_id / cashier_id | ✓ |
| order_items | id | order_id | ✓ |
| order_status_history | id | order_id | ✓ |
| deliveries | id | order_id (1:1) | ✓ |
| payments | id | order_id (1:1) | ✓ |
| esp32_devices | id | id only | ✓ |
| kitchen_alerts | id | order_id, device_id | ✓ |
| chatbot_conversations | id | customer_id | ✓ |
| chatbot_messages | id | conversation_id | ✓ |
| support_chats | id | customer_id (1:1) | ✓ |
| support_chat_messages | id | chat_id | ✓ |
| notifications | id | staff_id (nullable) | ✓ |
| audit_log | id | actor_id (nullable) | ✓ |
| customer_order_violations | id | customer_id, order_id | ✓ |
| customer_restrictions | customer_id | customer_id only (1:1) | ✓ |

---

## 6. Pages Overview (by role)

**Mobile App (Customer)**
1. Sign Up / OTP Verification / Sign In
2. Digital Menu (browse, real-time availability)
3. AI Chatbot (menu/FAQ inquiries)
4. Cart & Checkout (delivery preference, payment method)
5. Order Tracking (status timeline)
6. Support Chat (unlocks with active order)
7. Notifications
8. Account Settings

**Web App**

Routes are declared in `frontend/src/App.jsx`; each is wrapped in a `ProtectedRoute` with an explicit role list.

1. `/login` — shared, role-based redirect via `RoleRedirect` (cashier → `/cashier`, staff → `/staff/inventory`, owner → `/manager/dashboard`, kitchen_staff → `/kitchen`, admin → `/admin/accounts`)
2. **Cashier** — `/cashier`: Counter Ordering, POS/Payment (cash), transaction history. Real backend.
3. **Kitchen** — `/kitchen` (kitchen_staff, admin): Kitchen Order Display, Alert Panel, acknowledge + status. Real backend; the Alert Panel is populated — `kitchen_alerts` rows are created when a counter order is paid.
4. **Staff** — `/staff/{inventory,menu,delivery,chat}`. Inventory and Menu are backed by the real API. **Delivery and Support Chat are mock-only** (`MOCK_DELIVERIES`, `MOCK_CHAT_*` in `services/api.js`) — no `deliveries` or `support_chats` backend exists.
5. **Owner/Manager** — `/manager/{dashboard,sales,oversight/{kitchen,stocks,menu,delivery}}` (owner, and `manager` in code). Dashboard and Sales use the real `/api/orders/totals` and `/api/orders/report`. Oversight Kitchen/Stocks/Menu read real data; **Oversight Delivery has no backend** and renders its empty state.
6. **Admin** — `/admin/{accounts,settings,audit,restrictions}`. All four pages are UI-complete and **entirely mock-backed**; there are no `/api/admin/*` routes. Account creation, device registration and restriction overrides do not persist. The Audit page's own entries are mock-only, though note `audit_log` **is** written elsewhere by real controllers (see §4.10) — the page just doesn't read it.

---

## 7. Data Flow (High Level)

```
[Customer — Mobile App (Flutter)]            PLANNED, not in this repo
        ↓ REST API + Socket.io
[Node.js + Express + Socket.io Backend]
        ↓                    ↓
[PostgreSQL DB]     [PayMongo API/Webhook]    ← webhook is a log-only stub
                                             ← no OpenAI/Gemini call exists
        ↑
        ↓ Socket.io (WebSocket)
[ESP32 Device — Kitchen Alert]              ← fires when a counter order is paid

[Cashier / Kitchen / Staff / Owner / Admin / Manager — Web App (React/Vite)]
        ↓ REST API + Socket.io
[Node.js + Express + Socket.io Backend]  (same backend as above)
```

**Rooms:** `cashier`, `kitchen`, `staff`, `manager`, `esp32:<device_id>`. Only `manager` is derived from the handshake JWT (roles `owner`, `admin`, `manager`); it is auto-joined on connect so membership survives reconnects, and a token that is present but invalid is a hard reject. The other rooms accept an unauthenticated `join` emit.

**Events emitted by the backend:** `new_order` (kitchen), `order:new` (manager), `order:status` (all four web rooms), `order:ready` (staff, manager), `menu_update` + `menu_item_deleted` (all), `inventory:update` (staff, manager), `kitchen_alert` and `kitchen_alert:ack` (per-device — `kitchen_alert` now fires on payment), `delivery:update` (staff, manager, never called).

**Sync notes (as built):**
- Counter order created → `orders` insert at `status='pending'`, plus one `order_items` row per line (carrying `menu_item_option_id`/`menu_item_flavor_id` when the item has options), one `order_status_history` row, and one `payments` row (`cash`, `pending`) — all in a single transaction. **No socket emit and no kitchen alert at this point** — a counter order reaches the kitchen only once paid.
- Kitchen acknowledges → `confirmed`; then `preparing` → `ready`. Each transition writes history and emits `order:status`; `ready` also emits `order:ready` to prompt delivery assignment.
- Cashier records payment → the pre-existing `payments` row is updated to `paid` (`paid_at`, `cash_given`, `change_given`). In the same transaction: inventory is auto-deducted, a `kitchen_alerts` row is created and an `audit_log` row is written. After COMMIT (counter orders only): `new_order` to kitchen, `order:new` to manager, `inventory:update` per deducted ingredient, and `kitchen_alert` to the device. The order itself stays at its current kitchen status — payment does not change it.
- Ingredient forced out of stock (or restocked) → `menu_items.is_available` cascades → `menu_update` broadcast. This is staff-initiated, not order-initiated.
- Not wired: PayMongo webhook → payment status, and any delivery transition. (Inventory deduction IS wired — it happens on payment, see above.)

---

## 8. Security & Auth

- **Authentication:** JWT access token (30 min) + refresh token (7 days), payload `{ sub, type: 'customer'|'staff', role }`. Secrets come from `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` and **fall back to hardcoded dev strings** in `auth.jwt.js:3-4` if unset — they must be set in any real environment. Refresh tokens are tracked **server-side** in `refresh_tokens` (hash + `family_id`): login inserts a row, refresh looks the token up by hash and rotates it, and a reused token revokes the whole family — so a stolen refresh token is useless against the database.
- **Password hashing:** bcrypt, cost factor 12 (`auth.controller.js:14`).
- **OTP:** 6 digits from `crypto.randomBytes`, 10-minute expiry (`auth.otp.js:5`), used for staff password reset. Issuing a new OTP invalidates prior unused ones for the same contact + purpose. **Stored in plaintext** — `otp_verifications.otp_code` is not hashed, and `auth.otp.js:23` says so explicitly, so anyone who can read the table has every live reset code. Hash it before production use.
- **Rate limiting** (`middleware/rate-limit.middleware.js`), all keyed by IP:
  - `POST /api/auth/staff/login` — 10 per 15 min, `skipSuccessfulRequests: true` (only failures count)
  - `POST /api/auth/forgot-password` — 3 per 10 min
  - all `/api/*` — 200 per min
  - `POST /api/auth/reset-password` and `/api/auth/refresh` have no limiter beyond the global one.
- **RBAC middleware:** `authenticateToken` → `requireStaff` (blocks customers) → `requireRoles(...)` per route. Kitchen/orders/payments/menu/inventory all layer these; the exact per-route list is in `bingnondo_flow.md` §9.
- **Socket authorization:** only the `manager` room is enforced. A socket that presents a token has it verified, and a valid staff token with an owner-level role is auto-joined; a bad token is rejected outright. Every other room, plus `esp32:register`, is unauthenticated — a client can claim `kitchen` or `esp32:<any id>` by emitting `join`. Rooms are not scoped to the authenticated user, so guarding them is still outstanding.
- **Admin isolation:** not implemented. There is no admin backend, so Admin's own account/role/settings actions are not written to `audit_log`. The table **is** written by six non-admin paths (see §4.10) — failed logins, payments, menu changes, order cancels and auto-cancels — but nothing reads it back.
- **CORS:** `server.js:34-37` and the Socket.io server both use `origin: process.env.FRONTEND_URL || '*'` with `credentials: true`. Unset `FRONTEND_URL` means a wildcard origin.
- **ESP32 auth:** not implemented. The design called for a pre-shared token per `device_code` validated at handshake; `esp32:register` takes a `device_id` with no credential and no lookup.
- **Webhook validation:** not implemented. `POST /api/webhooks/paymongo` skips auth middleware and the handler performs no signature check and writes nothing — it logs the event type and returns `{received:true}`. The `server.js:55` comment describing a PayMongo-signed request is aspirational; treat this endpoint as unauthenticated and do not rely on it.

---

**End of document**
