# Bingnondo Cafe System — Flow Document

> Roles: Customer · Cashier · Kitchen Staff · Staff · Owner/Manager · Admin

---

## 0. How to Read This Document

This describes the system **as built**, not as originally designed. Sections carry one of these markers:

- **Live** — the backend endpoint exists and is wired to the database.
- **Mock-only** — the UI exists in `frontend/` but reads from in-memory `MOCK_*` arrays in `frontend/src/services/api.js`; there is no backend. Reloading the tab resets the data.
- **Inert** — the code path exists but can never be reached, usually because nothing creates the rows it would read.
- **Planned** — design intent, no code in either layer.

Only the Cashier, Kitchen, Staff (inventory/menu) and Manager flows are live end to end. §9 lists every route that actually exists.

The most important corrections versus the original design:

1. **Inventory is deducted automatically when a cash payment succeeds** (`payments.controller.js` `deductInventory()`), in addition to manual Staff moves. Nothing decrements stock at order *creation* — deduction happens at *payment*.
2. **Only cash payments work.** GCash returns HTTP 501; the PayMongo webhook is a log-only stub. `cash_given` / `change_given` are stored on the payment row.
3. **Kitchen acknowledgement is a distinct step.** An order is created as `pending`; the kitchen moves it to `confirmed`. Order creation does not confirm.
4. **A counter order reaches the kitchen only once it is paid.** `POST /api/orders` creates the row as `pending` and does NOT emit `new_order`; `POST /api/payments` emits `new_order` (kitchen) + `order:new` (manager) for counter orders, and is the sole trigger for the ESP32 buzzer.
5. **The kitchen alert is created on payment, not on order creation.** `POST /api/payments` inserts the `kitchen_alerts` row and emits `kitchen_alert` in the same transaction as the payment.
6. **Menu items sell as variants and flavors.** `menu_item_options` holds Hot/Iced-style variants and add-on flavors; an order line records both (`menu_item_option_id` + `menu_item_flavor_id`).
7. **The `manager` role is real.** Migration 017 added it to the `staff_accounts` role CHECK, so a manager account can be created and reaches the `/manager` pages.
8. **Menu items and options are archived, not deleted** (`archived_at`), so past order lines keep resolving their names.
9. **`audit_log` is written** by auth, payments, menu, orders and the auto-cancel scheduler — but no endpoint reads it yet.
10. **The whole Admin area, plus Delivery and Support Chat, is mock-only.** Four Admin pages are fully built against in-memory arrays with no backend.
11. **There is no mobile app, and no customer-facing route at all** except the public `GET /api/menu`.

---

## 1. Customer — Mobile App (Flutter) — **Planned**

> **Nothing in this section exists.** There is no Flutter app in this repository (no `pubspec.yaml`, no `.dart` files), and no customer auth, menu, order or chat routes on the backend. `customers`, `deliveries`, `support_chats` and `customer_restrictions` exist in the schema but nothing queries them. The design below is retained as the intent to build against.

### 1.1 Sign Up (Stage 1 — minimal) — **Planned**
```
[Sign Up] — POST /api/auth/customer/register
  ├─ Email Address
  ├─ Password (min 8 chars)
  ├─ OTP sent to email — POST /api/auth/customer/verify-otp
  └─ Success → status = active → redirect straight to Menu (Home)

  Rationale: keeping sign-up to just email + password + OTP lowers
  drop-off — customer sees the menu almost immediately, THEN is asked
  for personal details once they're actually motivated to order
  (progressive registration, same pattern as Shopee/Lazada).

  Edge Cases:
    ├─ Email already registered → "Already registered. Sign in instead."
    ├─ OTP expired → "OTP expired. Request a new one."
    └─ Mismatched confirm password → inline error
```

### 1.1b Complete Profile (Stage 2 — gated, required before ordering) — **Planned**
```
[Complete Profile] — PUT /api/customer/profile
  ├─ First Name, Last Name
  ├─ Mobile Number + OTP verification
  ├─ Address
  └─ On success → profile_completed = TRUE

  GATE RULE: Any attempt to place an order (POST /api/orders) while
  profile_completed = FALSE is rejected by the backend, not just hidden
  in the UI. The mobile app should intercept this proactively —
  e.g. tapping [Add to Cart] or [Checkout] with an incomplete profile
  redirects to this screen first, framed positively:
  "Just a few more details so we can get your order to you!"
```

### 1.2 Sign In — **Planned**
```
[Sign In] — POST /api/auth/customer/login
  ├─ Email/Mobile + Password
  ├─ "Forgot Password?" → OTP-based reset flow
  └─ Success → redirect to Menu (Home)

  Auth states:
    ├─ awaiting_verification → "Please verify your account first."
    └─ suspended → "Account suspended. Contact support."
```

---

### 1.3 Digital Menu (Home) — **Partially live**
> `GET /api/menu` is real and is the one customer-facing endpoint that works. It is public (no auth) and returns categories plus items without the ingredient list, so the Cashier POS uses it too. The mobile client, availability badges and the rest of this section are not built.

```
[Menu] — GET /api/menu
  ├─ Category tabs (from menu_categories)
  ├─ Each Menu Item Card:
  │   ├─ Photo, name, price, short description
  │   ├─ Availability badge — "Available" / "Unavailable"
  │   │     └─ Auto-updates in real time via Socket.io `menu_update` event.
  │   │        (The broadcast works; the mobile client that would consume it
  │   │        does not exist.)
  │   └─ [Add to Cart] (disabled if unavailable)
  └─ Floating chatbot icon (always visible) — chatbot not implemented
```

### 1.4 AI Chatbot — **Planned**
> No chatbot route, controller, or OpenAI/Gemini client exists. `chatbot_conversations` and `chatbot_messages` are schema-only.

```
[Chatbot] — POST /api/chatbot/message
  ├─ Scope: menu items, pricing, availability, general FAQ
  ├─ Backend builds prompt using live menu_items + FAQ context
  ├─ Calls OpenAI/Gemini API → returns response
  ├─ Stored in chatbot_conversations / chatbot_messages
  └─ If question is order-specific → bot replies:
      "For questions about an existing order, please use order chat once you've placed one."
```

---

### 1.5 Cart & Checkout — **Planned**
> The `POST /api/orders` endpoint exists but is counter-only. It hardcodes `order_type='counter'`, `order_channel='web_counter'`, and requires a staff token (cashier/staff/owner/admin). There is no customer ordering path, no delivery preference, and no customer-scoped payment method selection.

```
[Cart] — local state, then POST /api/orders
  ├─ Review items, adjust quantity, add notes
  ├─ Gate check: profile_completed must be TRUE
  │     └─ If FALSE → redirect to Complete Profile (§1.1b) before proceeding
  ├─ Step 1: Delivery Preference
  │   ├─ Own Delivery (rider arranged by cafe)
  │   └─ Lalamove
  │   └─ Note: this is a REQUEST — staff confirms/assigns after order is placed
  ├─ Step 2: Payment Method
  │   ├─ GCash → PayMongo checkout (in-app webview or redirect)
  │   └─ Cash on Delivery
  │       └─ Hidden if customer_restrictions.restriction_level = 'cod_restricted' (see §7.6)
  ├─ Step 3: Place Order — POST /api/orders
  │   └─ order_type = 'online', order_channel = 'mobile_app'  ← NOT IMPLEMENTED;
  │      the live endpoint hardcodes 'counter' / 'web_counter' and demands a
  │      staff token. Supporting this means adding an online branch plus a
  │      customer auth scope.
  │   └─ Blocked entirely if restriction_level = 'suspended' — restriction
  │      logic is not implemented; customer_restrictions is never read
  └─ Order Confirmation screen — Order # + estimated status

  Edge Cases:
    ├─ Item becomes unavailable while in cart → flagged before submit, must
    │  remove. (This validation is live and server-side: an unavailable item
    │  returns 400 at order creation.)
    ├─ GCash payment fails → n/a; GCash returns 501
    └─ Empty cart → checkout disabled
```

### 1.6 Order Tracking — **Partially live**
> `GET /api/orders/:id`, `PATCH /api/orders/:id/status` and `POST /api/orders/:id/cancel` exist, but all require a **staff** token — a customer cannot read or cancel their own order. The cancel endpoint does not write a `customer_order_violations` row.

```
[Order Status] — GET /api/orders/:id
  ├─ Status timeline: Pending → Confirmed → Preparing → Ready
  │                   → Out for Delivery → Completed
  │                   (or → Cancelled)
  ├─ Delivery info (once assigned): rider name/contact or Lalamove tracking
  ├─ Real-time updates via Socket.io `order_status_update`
  └─ [Cancel Order] — only visible while deliveries.status = 'pending_assignment'
      └─ POST /api/orders/:id/cancel
      └─ Logs a customer_order_violations entry (violation_type='cancelled_before_prep') — see §7.6
```

### 1.7 Support Chat (Customer ↔ Staff) — **Planned (staff side is mock-only)**
> No support-chat backend. The staff-side page (`/staff/chat`) is fully built but reads from `MOCK_CHAT_THREADS` / `MOCK_CHAT_MESSAGES`.

```
[Order Chat] — GET /api/support-chat  |  POST /api/support-chat/message
  ├─ ONE thread per customer (not per order)
  ├─ Unlock condition: at least 1 order not in (completed, cancelled)
  ├─ Lock condition: all orders completed or cancelled
  ├─ Message can optionally tag a related_order_id for staff context
  └─ If no active order → chat UI shows:
      "No active order. Ask our chatbot for menu questions, or place an order to chat with staff."
```

### 1.8 Notifications — **Planned**
> No notifications backend and no `notifications` writes. No client-side push either.

```
[Notifications] — GET /api/customer/notifications
  ├─ Order confirmed / preparing / ready / out for delivery / completed
  ├─ Payment received/failed
  ├─ New staff reply in support chat
  └─ Push notification (mobile) + in-app badge
```

### 1.9 Account Settings — **Planned**

```
[Profile] — PUT /api/customer/profile
  ├─ Name, mobile number (re-verification via OTP if changed)
  ├─ Change password
  └─ Saved payment method (optional, PayMongo tokenized)
```

---

## 2. Cashier — Web App — **Live**

> The only fully live ordering path in the system. `POST /api/orders` requires a staff token, so this flow is counter-only — the same endpoints would be reused for online orders, but no customer client exists.

### 2.1 Login
```
[Login] — POST /api/auth/staff/login   (rate-limited: 10 per 15 min, failures only)
  ├─ Body: { email, password }
  ├─ Returns { accessToken (30m), refreshToken (7d), user }
  ├─ The refresh token is stored server-side: a hash row in
  │  refresh_tokens (token_hash, family_id). Rotation marks the old
  │  row replaced_by; reuse of a revoked token kills the whole
  │  family_id line.
  ├─ A failed login writes an audit_log row (staff_login_failed).
  ├─ Deactivated account → 403 "Account suspended. Contact your administrator."
  └─ Redirect based on role → Cashier lands on /cashier
```

### 2.2 Counter Ordering
```
[Counter Order] — POST /api/orders
  ├─ Menu grid loaded from GET /api/menu (public, no ingredients shown)
  ├─ Server re-validates every line: item must exist AND is_available = true,
  │  quantity >= 1. Total is computed server-side from menu_items.price —
  │  the client never supplies an amount.
  ├─ Inserted in ONE transaction:
  │    orders            status='pending', order_type='counter',
  │                      order_channel='web_counter', cashier_id = current user
  │    order_items       one row per line, unit_price snapshot, plus
  │                      menu_item_option_id / menu_item_flavor_id when
  │                      the line picked a variant and/or a flavor
  │    order_status_history  initial 'pending' row
  │    payments          one row, method='cash', status='pending'
  ├─ Deliberately NO kitchen alert and NO `new_order` emit here —
  │  a counter order is promoted to the kitchen only once it is
  │  paid (see §2.3). (A non-counter order would emit `new_order`
  │  at creation, but no such path exists yet.)
  └─ 201 returns the order with `order_number` = "ORD-" + id padded to 4

  Edit before kitchen acknowledges — PATCH /api/orders/:id/items
  ├─ Guarded by `orders.controller.js:703`: only while status = 'pending',
  │  409 once kitchen has acknowledged. (The comment on that handler says
  │  "'confirmed'", which contradicts its own check — the code wins.)
  ├─ Replaces all order_items, recomputes total, and re-syncs the
  │  pending payments.amount
  ├─ Replaces all order_items, recomputes total, and re-syncs the
  │  pending payments.amount
  └─ No socket emit (nothing downstream has seen the change yet)
```

### 2.3 POS / Payment
```
[Payment] — POST /api/payments
  ├─ Cash → works. Validates cash_given >= total_amount, returns change.
  ├─ GCash → 501 "GCash / PayMongo payment is not yet available."
  │         (no PayMongo integration exists at all)
  ├─ Counter orders may be paid with cash only; cash_on_delivery is
  │  reserved for online orders (which do not exist yet).
  ├─ In ONE transaction:
  │    payments          status='paid', paid_at, cash_given, change_given
  │    inventory_transactions  one 'deduction' row per ingredient the
  │                      order consumed (reference_order_id = this order),
  │                      idempotent via the partial unique index — a
  │                      retried payment does not double-deduct
  │    inventory_items   current_stock decremented for each
  │    kitchen_alerts    one row (order_id, device_id), device resolved
  │                      from esp32_devices by ESP32_DEVICE_CODE
  │    audit_log         one 'payment_paid' row
  ├─ Updates the EXISTING payments row in place — never inserts a second.
  │  Uniqueness on payments(order_id) is enforced in the DB.
  ├─ Refused with 409 if the order is already paid, or if it was cancelled.
  │  Both checks run under SELECT ... FOR UPDATE on the order row, which
  │  POST /api/orders/:id/cancel also locks, so a payment and a
  │  cancellation cannot interleave.
  ├─ After COMMIT, for a counter order: emits new_order (kitchen) +
  │  order:new (manager) — this is the step that promotes the order to
  │  the kitchen — then inventory:update per deducted ingredient, then
  │  kitchen_alert (kitchen + esp32:<id>) to fire the buzzer.
  ├─ Does NOT change orders.status — the order stays wherever the
  │  kitchen moved it.
  └─ Receipt (printable/on-screen summary) with change calculation
```

### 2.4 Order History (Cashier view)
```
[My Transactions] — GET /api/orders?range=today|week
  ├─ A cashier is server-scoped to their own orders (o.cashier_id = token sub);
  │  other roles see all. This is enforced in buildOrderFilters.
  ├─ Filter: Today | This Week, or explicit from/to
  └─ Each row: Order #, items, total, payment method, status
```

---

## 3. Kitchen Staff — Web App — **Live** (alert panel is inert)

> Kitchen drives the order through its middle states. It is also the step that "confirms" an order — see 3.1.

### 3.1 Kitchen Order Display
```
[Kitchen Display] — GET /api/kitchen/orders
  ├─ Returns the prep queue (pending + confirmed + preparing) with items
  │  resolved to menu names, plus order_type / order_channel / order_number
  ├─ Real-time feed via Socket.io `new_order`
  ├─ Card per order: Order #, channel, items, notes, time received

  [Acknowledge] — PATCH /api/kitchen/orders/:id/acknowledge
  └─ pending → confirmed. This is the step that "confirms" an order;
     order creation does NOT confirm it.

  [Start Preparing] — PATCH /api/kitchen/orders/:id/status { status: 'preparing' }
  [Mark Ready]      — PATCH /api/kitchen/orders/:id/status { status: 'ready' }
  ├─ Kitchen may only set 'preparing' or 'ready'; anything else is 400.
  ├─ Every legal move is checked against status-transitions.js, not just
  │  the kitchen's own allowlist, so an illegal jump is 409.
  ├─ Writes order_status_history, emits order:status to kitchen/cashier/
  │  staff/manager, and on 'ready' additionally emits order:ready to
  │  staff + manager to prompt delivery assignment.
  └─ 'completed' and 'out_for_delivery' are reachable in the transition map
     but nothing writes them — the kitchen stops at 'ready'.
```

### 3.2 ESP32 Alert Panel — **Live**
> The UI renders from `GET /api/kitchen/alerts`, which is now populated: `POST /api/payments` inserts a `kitchen_alerts` row for every paid counter order (in the payment transaction) and emits the `kitchen_alert` socket event. The `emitKitchenAlert` / `emitKitchenAlertAck` helpers in `sockets/index.js` are called by the payment, kitchen-acknowledge, order-cancel and auto-cancel-scheduler paths. At most one unacknowledged alert per order is enforced by the partial unique index `idx_kitchen_alerts_one_open_per_order`. Device *registration* is still mock-only (`esp32_devices` rows come from the seed), so alerts target the seeded device.

```
[Alert Panel] — Socket.io event `kitchen_alert` (emitted on payment)
  ├─ Physical buzzer/LED on ESP32 — fires when a paid order's alert arrives
  ├─ On-screen alert banner — renders the live alert list
  ├─ [Acknowledge] — POST /api/kitchen/alerts/:id/acknowledge (live)
  │  marks acknowledged_at / acknowledged_by and emits kitchen_alert:ack
  │  so the ESP32 goes quiet
  └─ Auto-cancel scheduler retires a buzzer when its unpaid order times out
```

---

## 4. Staff — Web App — **Live** (inventory and menu only)

### 4.1 Inventory Management — **Live**
```
[Inventory] — GET /api/inventory
  ├─ List of ingredients: name, unit, current stock, reorder level,
  │  and a computed is_low_stock flag (current_stock <= reorder_level)
  ├─ [Add ingredient] — POST /api/inventory
  ├─ [Restock / Adjust / Deduct] — POST /api/inventory/:id/transaction
  │     { change_type: 'restock'|'adjustment'|'deduction', quantity }
  │     restock    → adds quantity
  │     deduction  → subtracts, floored at 0
  │     adjustment → sets the absolute new value
  │  Every change writes an inventory_transactions row.
  ├─ [Mark out of stock] — POST /api/inventory/:id/out-of-stock
  │     forces the ingredient to 0 AND cascades is_available = false onto
  │     every menu item linked to it. A restock re-enables items that have
  │     no other out-of-stock ingredient. Both broadcast `menu_update`.
  └─ [History] — GET /api/inventory/:id/transactions

  AUTOMATIC DEDUCTION (live): when a cash payment succeeds,
  payments.controller.js deductInventory() computes each ingredient the
  order consumed (order_items × menu_item_ingredients.quantity_required),
  writes one 'deduction' inventory_transactions row per ingredient with
  reference_order_id = the paid order, and decrements current_stock. It is
  idempotent — the partial unique index
  idx_inventory_txns_order_item(reference_order_id, inventory_item_id)
  WHERE change_type='deduction' makes a retried payment a no-op. Manual
  restock / adjustment / deduction (above) is still available and leaves
  reference_order_id NULL.
```

### 4.2 Menu Management — **Live**
```
[Menu Management]
  ├─ List — GET /api/menu/staff (enriched: category name + linked ingredients
  │  with their live stock levels)
  ├─ Add/edit item — POST /api/menu, PUT /api/menu/:id
  │     Accepts an optional ingredient list, which replaces the existing
  │     menu_item_ingredients rows for that item.
  ├─ Link ingredients + quantity required (menu_item_ingredients)
  ├─ Variants & flavors — POST /api/menu/:id/options,
  │     PUT /api/menu/:id/options/:optionId,
  │     DELETE /api/menu/:id/options/:optionId
  │     Each option is a sellable form (option_kind='variant', e.g. Hot/Iced)
  │     or an add-on (option_kind='flavor', e.g. Adobo) with its own absolute
  │     price. A cashier picks one variant and optionally one flavor per line.
  ├─ Manual availability override — PATCH /api/menu/:id/availability
  │     Independent of stock, e.g. temporarily hide an item.
  ├─ Delete item — DELETE /api/menu/:id archives it (sets archived_at) rather
  │     than deleting, so past order lines keep resolving the item name.
  │     Same archive-not-delete rule applies to options.
  └─ Categories — GET/POST /api/menu/categories, DELETE /api/menu/categories/:id
       (a category still pointed at by an item or ingredient is refused)

  All changes broadcast `menu_update` to every connected client.
```

### 4.3 Delivery Assignment — **Mock-only**
> No backend. `/staff/delivery` renders from `MOCK_DELIVERIES` in `services/api.js`; `deliveryAPI.assign` and `updateStatus` mutate that array in place and nothing persists. The Manager's oversight delivery page uses a *separate* stub at `frontend/src/services/managerApi.js:189` that returns `{ data: [] }` and renders its empty state. There is no `deliveries` table, controller or route, and no Lalamove integration.

```
[Delivery Queue] — MOCK ONLY
  ├─ Shows customer's requested preference (own_delivery / lalamove) — from mocks
  ├─ Own Delivery → rider name + contact (mock mutation)
  └─ Lalamove → mock booking id, no API call
```

### 4.4 Support Chat Inbox — **Mock-only**
> No backend. Threads, messages, send and lock behaviour all run against `MOCK_CHAT_THREADS` / `MOCK_CHAT_MESSAGES` in `services/api.js`. `sender_type`, `related_order_id` and the auto-lock rule are implemented client-side only.

```
[Support Chat Inbox] — MOCK ONLY
  ├─ List of customer threads (unlocked first)
  ├─ [Reply] mutates the mock array; no persistence, no Socket.io
  └─ Lock state is derived from mock active_orders
```

---

## 5. Owner/Manager — Web App — **Live** (one oversight page is not)

> There is no `/api/analytics/*` module. The Manager area is served by the orders and inventory endpoints, and is strictly read-only: no manager route mutates orders, stock or deliveries. `App.jsx:122` gates `/manager` on `['manager','owner']`, and the schema's role `CHECK` now includes `manager` (migration 017), so a `manager` or `owner` account reaches these pages.

### 5.1 Dashboard
```
[Dashboard] — GET /api/orders/totals  +  GET /api/kitchen/orders  +  GET /api/inventory
  ├─ KPI cards: revenue, order counts, low-stock count
  ├─ Aggregates are computed server-side in ONE row — the pages used to
  │  request limit=10000 and aggregate in the browser, which silently
  │  truncated at the backend ceiling. Reads are now bounded; the backend
  │  still clamps any single read at 10 000 but nothing asks for it.
  ├─ Live via Socket.io: order:new, order:status, inventory:update
  │  (manager room is the one room authorized from the handshake token)
  └─ Recent activity feed
```

### 5.2 Sales Report
```
[Sales Report] — GET /api/orders/report
  ├─ Filter by date range, status, payment method, free-text search
  │  (searches order number OR item name; LIKE wildcards are escaped)
  ├─ Revenue is bucketed by day AND hour. The client sends its own IANA
  │  timezone so "today" means the viewer's calendar day, not the
  │  server's zone — otherwise the browser and server disagree by a day.
  ├─ Export to CSV (frontend utils/csv.js)
  ├─ Drill into individual order detail
  └─ Revenue counts a payment only when status='paid' AND the order is
     not 'cancelled' — which is why a payment on a cancelled order is
     refused outright rather than silently dropped.
```

### 5.3 Operational Oversight (read access)
```
[Oversight Views] — read-only across modules
  ├─ /manager/oversight/kitchen — GET /api/kitchen/orders + /alerts  (live)
  │     The alerts list is populated: a row is inserted per paid counter
  │     order (see §2.3).
  ├─ /manager/oversight/stocks  — GET /api/inventory               (live)
  ├─ /manager/oversight/menu    — GET /api/menu/staff              (live)
  ├─ /manager/oversight/delivery — EMPTY STATE, no backend exists
  └─ Owner does NOT manage staff accounts — that is Admin's scope
```

---

## 6. Admin — Web App — **Mock-only (all of it)**

> There is **no Admin backend**. No `/api/admin/*` route exists. All four pages below are UI-complete but call `adminAPI` in `frontend/src/services/api.js`, which awaits a fake delay and mutates in-memory arrays (`MOCK_STAFF_ACCOUNTS`, `MOCK_DEVICES`, `MOCK_SETTINGS`, plus an audit array). Creating a staff account, registering a device, changing a restriction or "logging" an action all disappear on reload, and nothing reaches the database. Treat this section as a UI prototype, not a working feature.

### 6.1 Account Management — **Mock-only**
```
[Staff Accounts] — MOCK ONLY
  ├─ List, search, filter by role/status — filters a local array
  ├─ [+ Create Account] — pushes onto MOCK_STAFF_ACCOUNTS
  ├─ [Deactivate] / [Reactivate] — flips a local field
  ├─ [Reset Password] — records an audit entry, sends nothing
  └─ Nothing is written to staff_accounts or audit_log.
```

### 6.2 System Settings — **Mock-only**
```
[System Settings] — MOCK ONLY
  ├─ ESP32 Devices: register/remove mutate MOCK_DEVICES. Never inserted into
  │  esp32_devices, so a registered device has no database row and the
  │  kitchen's LEFT JOIN to it can never resolve.
  ├─ API Keys: PayMongo, OpenAI/Gemini — local form fields only
  └─ General config — local object only
```

### 6.3 Audit Log — **Page mock-only; the table is live (write-only)**
```
[Audit Log] — PAGE reads mock data
  ├─ Filter by actor, action type, date range — client-side (mock)
  └─ BUT the `audit_log` table IS written by the real backend: failed staff
     logins (auth), payments (payments.controller.js), menu updates and
     availability toggles (menu.controller.js), order cancellations
     (orders.controller.js) and automatic cancellations (scheduler.js).
     No GET endpoint reads it yet, so this page still renders mock rows
     until a read route is added.
```

### 6.4 Customer Restrictions — **Mock-only**
```
[Customer Restrictions] — MOCK ONLY
  ├─ List customers with restriction_level != 'none' — from mocks
  ├─ View violation history — from mocks
  └─ [Lift/Override Restriction] — local mutation only
        Note: customer_order_violations is never written by the backend
        either — POST /api/orders/:id/cancel does not record a violation —
        so the graduated-response flow in §7.6 has no live input today.
```

---

## 7. Cross-Cutting Flows

### 7.1 Order Status Flow — **Live, with two unreachable states**

`backend/src/modules/orders/status-transitions.js` is the single source of truth. Both the generic endpoint and the kitchen endpoint validate against it, so the two cannot drift.

```
Pending → Confirmed → Preparing → Ready → [Out for Delivery] → Completed
   ↘         ↘
Cancelled  Cancelled

- Pending:          Order placed by the cashier. Items still editable.
- Confirmed:        Kitchen acknowledged. Items lock.
- Preparing:        Kitchen started. Cancellation is now refused.
- Ready:            Food ready; emits order:ready so Staff can assign delivery.
- Out for Delivery: NOT REACHABLE — no delivery backend writes it.
- Completed:        NOT REACHABLE — nothing writes it today.
- Cancelled:        Only from pending or confirmed. Both are terminal.

Rules enforced by canTransition():
  - Cancellation is only legal before cooking starts (pending/confirmed).
  - Terminal states (completed, cancelled) permit no further moves.
  - Backward moves are refused (ready → preparing is a 409).
  - Unknown statuses are rejected 400.
  - Re-setting the current status is a no-op, NOT an error: it succeeds,
    writes no history row, and emits no socket event, so a retried request
    is safe.
```

Two endpoints write status, both using the same table:
- `PATCH /api/orders/:id/status` — any staff with status-update rights
- `PATCH /api/kitchen/orders/:id/status` — additionally limited to `preparing` / `ready` (400 otherwise)

### 7.2 Delivery Flow — **Planned**
```
Customer selects preference (own_delivery / lalamove) at checkout
        ↓
Order reaches 'ready' status
        ↓
Staff reviews Delivery Queue → confirms & assigns
        ↓
   ┌─────────────┴─────────────┐
own_delivery                lalamove
   │                            │
assign rider manually     book via Lalamove, store booking_id
   │                            │
   └─────────────┬──────────────┘
        status: assigned → out_for_delivery → delivered
```

### 7.3 Support Chat Flow — **Planned** (staff side mock-only)

```
Customer places order → support_chats.status = 'unlocked'
        ↓
Customer + Staff exchange messages (optionally tagged to an order)
        ↓
All customer's orders reach completed/cancelled
        ↓
support_chats.status = 'locked' (system-enforced on every order status change)
```
> No backend. The staff inbox implements this rule against mock data only, and the customer side does not exist.

### 7.4 Kitchen Alert Flow — **Live (triggered by payment)**

```
Counter order paid (POST /api/payments)
        ↓
Same transaction: INSERT into kitchen_alerts (order_id, device_id)   ✅
        ↓
COMMIT, then emitKitchenAlert → kitchen + esp32:<id> rooms          ✅
        ↓
ESP32 polls GET /api/esp32/alert → buzz: true → buzzer fires        ✅
        ↓
Kitchen acknowledges → POST /api/kitchen/alerts/:id/acknowledge
        → emitKitchenAlertAck → esp32:<id> → buzzer stops           ✅
```
> The whole chain is live. The alert is created on payment (not on order
> creation — creating it there collided with the one-open-alert-per-order
> index). Device *registration* is still mock-only, so the buzzer targets the
> seeded `esp32_devices` row.

### 7.5 Inventory → Menu Availability Sync — **Live, but staff-initiated**

```
POST /api/inventory/:id/out-of-stock
        ↓
inventory_items.current_stock = 0
        ↓
Every menu item linked via menu_item_ingredients → is_available = FALSE
        ↓
Socket.io `menu_update` broadcast → availability badges update with no reload
```
Reverse direction, also live:
```
POST /api/inventory/:id/transaction { change_type: 'restock'|'adjustment' }
        ↓
Menu items with no remaining out-of-stock ingredient → is_available = TRUE
        ↓
Socket.io `menu_update` broadcast
```

**Implemented:** deduction triggered by a *paid* order. When a cash payment succeeds, `deductInventory()` writes a `deduction` row per consumed ingredient with `reference_order_id` populated (see §4.1). There is still no "stock insufficient for one more unit" *pre-check* on the order path — deduction happens after payment, not before, so an order can be placed and paid even if it over-drafts an ingredient.

### 7.6 Customer Order Violation & Restriction Flow — **Planned**
```
Trigger events:
  ├─ Customer cancels order (system-triggered, flagged_by = NULL)
  │     ├─ Before preparing  → violation_type = 'cancelled_before_prep'
  │     └─ After preparing   → violation_type = 'cancelled_after_prep' (staff-initiated cancel path)
  └─ Staff/rider marks a delivered/counter order as unclaimed → violation_type = 'no_show'
        ↓
POST /api/customer-violations (system or staff-triggered)
        ↓
Backend counts customer_order_violations for that customer in the last 30 days
        ↓
   ┌───────────┬────────────────┬─────────────────┬─────────────────┐
  1st          2nd              3rd               4th+
   │            │                │                 │
 log only   in-app warning   restriction_level  restriction_level
                             = 'cod_restricted'  = 'suspended'
                             (GCash-only         (order placement
                              at checkout)        blocked)
        ↓
customer_restrictions row upserted (customer_id, restriction_level, reason, updated_by=NULL)
        ↓
On next checkout attempt, backend checks customer_restrictions.restriction_level:
  ├─ none / warned      → normal checkout, all payment methods shown
  ├─ cod_restricted     → "Cash on Delivery" option hidden, GCash only
  └─ suspended          → order blocked, message: "Please contact the cafe to resolve this."

Admin/Owner override:
  PATCH /api/admin/customer-restrictions/:customer_id
  → sets restriction_level manually, updated_by = admin's staff_accounts.id (never NULL)
  → logged for audit purposes
```
> No backend writes `customer_order_violations`. The cancellation endpoint
> (`POST /api/orders/:id/cancel`) exists and is staff-only, but it does not
> record a violation, so the counting window above has no live input. The
> Admin override is mock-only.

---

## 8. Error & Edge Cases

All error bodies are `{ message: "..." }`; the global handler in `server.js:72` supplies the 500.

```
Global Error Handling:
  ├─ 400 → validation failure, e.g. "method must be one of: cash, gcash, cash_on_delivery."
  ├─ 401 → "Authentication required." / "Invalid or expired token. Please sign in again."
  ├─ 403 → "You don't have permission to perform this action."
  ├─ 404 → "Endpoint not found." (unmatched route) or "Order not found."
  ├─ 409 → state conflict: illegal status transition, already-paid, or
  │        "This order has been cancelled and cannot be paid."
  ├─ 429 → rate limited (login / OTP / global limits)
  ├─ 500 → "Something went wrong. Please try again."
  └─ 501 → GCash specifically: "GCash / PayMongo payment is not yet available."
```

```
Order edge cases (all live):
  ├─ Item unavailable at submit → 400 '"<name>" is currently unavailable.'
  ├─ Edit after acknowledge → 409, items lock at 'confirmed'
  ├─ Cancel after preparing → refused; cancellation is pending/confirmed only
  ├─ Pay a cancelled order → 409 (both checks under the same row lock)
  ├─ Pay twice → 409 "This order has already been paid."
  ├─ Cash given < total → 400 with both amounts in the message
  ├─ Retried status change → succeeds, no duplicate history row, no event
  └─ Manager reads clamp at 10 000 rows per request
```

```text
Socket edge cases:
  ├─ No/invalid token → connection allowed; only 'manager' is refused
  ├─ Token present but invalid/expired → connection rejected outright
  └─ Sign-out while in 'manager' → client emits 'leave' explicitly
         (the server cannot otherwise notice a discarded token)
```

```
Empty States (which are real vs mock):
  ├─ Kitchen alerts list → populated once a counter order is paid
  ├─ Manager oversight delivery → always empty (no backend)
  ├─ Support chat → mock data, not a real empty state
  └─ Delivery queue → mock data, not a real empty state
```

---

## 9. API Endpoints — Actual Registered Routes

Every route the backend actually mounts, transcribed from the `*.routes.js` files and the mount points in `server.js`. There are 46. Anything not listed here **does not exist**, regardless of what a page in the frontend appears to call.

Verified against the running tree with:
`Get-ChildItem -Recurse -File backend\src -Filter *.routes.js | Select-String -Pattern "router\.(get|post|patch|put|delete)\("`

**Guard notation:**
- `pub` — no authentication
- `staff` — `authenticateToken` + `requireStaff` (any staff role)
- `roles(...)` — additionally restricted to the listed roles

```
Health:
  GET    /api/test                          pub

Auth (mounted at /api/auth):
  POST   /api/auth/staff/login              pub    (loginLimiter: 10/15min, failures only)
  POST   /api/auth/forgot-password          pub    (otpLimiter: 3/10min)
  POST   /api/auth/reset-password           pub
  POST   /api/auth/refresh                  pub
  POST   /api/auth/logout                   staff
  GET    /api/auth/me                       staff

Menu:
  GET    /api/menu                          pub    (public + cashier read-only view)
  GET    /api/menu/staff                    staff  (enriched: category + ingredients)
  GET    /api/menu/categories               staff
  POST   /api/menu/categories               roles(staff, owner, admin)
  DELETE /api/menu/categories/:id           roles(staff, owner, admin)
  GET    /api/menu/:id                      staff
  POST   /api/menu                          roles(staff, owner, admin)
  PUT    /api/menu/:id                      roles(staff, owner, admin)
  PATCH  /api/menu/:id/availability         roles(staff, owner, admin)
  DELETE /api/menu/:id                      roles(staff, owner, admin)  (archives)
  POST   /api/menu/:id/options              roles(staff, owner, admin)  (variant/flavor)
  PUT    /api/menu/:id/options/:optionId    roles(staff, owner, admin)
  DELETE /api/menu/:id/options/:optionId    roles(staff, owner, admin)  (archives)

Inventory:
  GET    /api/inventory                     staff
  POST   /api/inventory                     roles(staff, owner, admin)
  GET    /api/inventory/:id                 staff
  PATCH  /api/inventory/:id                 roles(staff, owner, admin)
  DELETE /api/inventory/:id                 roles(staff, owner, admin)
  POST   /api/inventory/:id/transaction     roles(staff, owner, admin)
  GET    /api/inventory/:id/transactions    staff
  POST   /api/inventory/:id/out-of-stock    roles(staff, owner, admin)

Orders:
  POST   /api/orders                        roles(cashier, staff, owner, admin)  (counter only)
  GET    /api/orders                        staff  (cashier scoped to own orders)
  GET    /api/orders/totals                 staff  (one-row revenue aggregate)
  GET    /api/orders/report                 staff  (range revenue, best sellers, counts)
  GET    /api/orders/:id                    staff
  PATCH  /api/orders/:id/status             roles(kitchen_staff, cashier, staff, owner, admin)
  POST   /api/orders/:id/cancel             staff
  PATCH  /api/orders/:id/items              roles(cashier, staff, owner, admin)  (pending only)

Payments:
  POST   /api/payments                      roles(cashier, staff, owner, admin)  (cash; gcash → 501)
  GET    /api/payments/:orderId             staff

Kitchen:
  GET    /api/kitchen/orders                staff
  PATCH  /api/kitchen/orders/:id/acknowledge   roles(kitchen_staff, staff, owner, admin)
  PATCH  /api/kitchen/orders/:id/status        roles(kitchen_staff, staff, owner, admin)  (preparing|ready)
  GET    /api/kitchen/alerts                staff    (populated on payment)
  POST   /api/kitchen/alerts/:id/acknowledge  roles(kitchen_staff, staff, owner, admin)
  GET    /api/kitchen/devices               staff

Webhook:
  POST   /api/webhooks/paymongo             pub    (STUB: logs and returns {received:true},
                                                      no signature check, no DB write)

Esp32 (mounted at /api/esp32):
  GET    /api/esp32/alert                   deviceAuth (x-device-key header +
                                                      device_code query param)
```

`GET /api/test` and the PayMongo webhook are the only unauthenticated non-mutation routes. All `/api/*` requests pass through the global 200/min limiter.

### 9.1 Frontend calls that hit no backend

`frontend/src/services/api.js` exports several API objects whose methods await a fake delay and return local arrays. They are UI, not integrations:

```
deliveryAPI      (staff delivery queue)   — MOCK_DELIVERIES, mutations are local
supportChatAPI   (staff chat inbox)       — MOCK_CHAT_THREADS / MOCK_CHAT_MESSAGES
adminAPI         (all four Admin pages)    — MOCK_STAFF_ACCOUNTS, MOCK_DEVICES,
                                            MOCK_SETTINGS, local audit array
deliveryAPI      (managerApi.js)           — a SECOND export of the same name,
                                            returns { data: [] }
```

Note the duplicate name: `deliveryAPI` is exported from both `services/api.js` and `services/managerApi.js` with different behaviour. Consolidating them needs care.

Do not confuse the Admin page's *mock* audit array with the real `audit_log` table: the backend writes `audit_log` from auth, payments, menu, orders and the scheduler (see §6.3), but no route reads it back, so the Admin Audit Log page still renders mock rows.

---

**End of document**
