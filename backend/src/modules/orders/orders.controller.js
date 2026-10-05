const db = require('../../config/db');
const socketHub = require('../../sockets');
const { priceCart, CartError } = require('../../services/pricing.service');
const { ALL_STATUSES, isKnownStatus, canTransition, canTransitionAs } = require('./status-transitions');

// ─── Helper: format order number ─────────────────────────────────────────────
function orderNumber(id) {
  return `ORD-${String(id).padStart(4, '0')}`;
}

/**
 * Whether `req.user` is allowed to act on an order belonging to `cashierId`.
 *
 * Mirrors the scoping `buildOrderFilters` already applies to the read paths: a
 * cashier is confined to their own orders, while owner / admin / staff act
 * across the whole shop as a supervisor override.
 *
 * This existed only on reads. The write paths (pay, cancel, status, items)
 * accepted any order id, so in a cafe with two tills either cashier could mark
 * the other's order paid, cancel it, or re-price it — and the read scoping
 * meant the victim could not even see the result afterwards.
 */
function ownsOrder(req, cashierId) {
  if (req.user.role !== 'cashier') return true;
  // An order with no recorded owner is not "somebody else's". Orders created
  // through POST /api/orders always carry one, so this only covers rows that
  // predate that (or fixtures). Treating NULL as forbidden would 403 those.
  if (cashierId === null || cashierId === undefined) return true;
  return Number(cashierId) === Number(req.user.sub);
}

const NOT_YOUR_ORDER = { message: 'You can only act on your own orders.' };

// Reporting buckets default to Asia/Manila. Real clients always send
// their own (see getOrderReport); this only covers callers like curl that
// don't, and matching the server keeps it consistent with the `range=today`
// preset, which Postgres evaluates against CURRENT_DATE in the server zone.
const DEFAULT_REPORT_TZ = 'Asia/Manila';

/**
 * Whether a string is an IANA timezone name this runtime understands.
 *
 * The value is passed to Postgres as a bind parameter, so it can't be SQL
 * injection — but an unknown zone makes `AT TIME ZONE` raise at runtime, which
 * would turn a typo in a query string into a 500. Validating first lets the
 * report fall back to the default instead.
 */
function isValidTimeZone(tz) {
  // Guard the type first. Per ECMA-402, `timeZone: undefined` means "use the
  // runtime default" and does not throw, so passing it straight to Intl would
  // validate successfully and then send an undefined value to Postgres.
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────
// Cashier creates a counter order.
// Body: { items: [{ menu_item_id, quantity, notes? }], special_request? }
// Status starts as 'pending' so it lands in kitchen's New Orders tab first.
// Kitchen acknowledges → 'confirmed' → 'preparing' → 'ready'.
// A 'pending' payment row is created; cashier marks paid via POST /api/payments.
async function createOrder(req, res, next) {
  const client = await db.getClient();
  try {
    const { items, special_request } = req.body;

    let totalAmount;
    let validated;
    try {
      ({ totalAmount, validated } = await priceCart(items));
    } catch (err) {
      if (err instanceof CartError) return res.status(400).json({ message: err.message });
      throw err;
    }

    await client.query('BEGIN');

    // 1. Insert order — status 'pending' so kitchen sees it in New Orders first.
    //    Kitchen acknowledges → 'confirmed' → 'preparing' → 'ready'.
    const orderRes = await client.query(
      `INSERT INTO orders
         (order_type, cashier_id, status, order_channel, total_amount, special_request)
       VALUES ('counter', $1, 'pending', 'web_counter', $2, $3)
       RETURNING *`,
      [req.user.sub, totalAmount, special_request || null]
    );
    const order = orderRes.rows[0];
    order.order_number = orderNumber(order.id);

    // 2. Insert order items
    for (const item of validated) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, menu_item_option_id, menu_item_flavor_id, quantity, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, item.menu_item_id, item.menu_item_option_id, item.menu_item_flavor_id, item.quantity, item.unit_price, item.notes]
      );
    }

    // 3. Log initial status in history
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'pending', $2)`,
      [order.id, req.user.sub]
    );

    // 4. Create pending payment record (method updated when cashier confirms payment)
    await client.query(
      `INSERT INTO payments (order_id, method, amount, status) VALUES ($1, 'cash', $2, 'pending')`,
      [order.id, totalAmount]
    );

// 5. No kitchen alert here on purpose.
    //    Creating an order is NOT the trigger for the ESP32 buzzer — the only
    //    trigger is a successful payment (see payments.controller.js). Creating
    //    an alert here rang the buzzer at Confirm Order and then collided with
    //    the paid-only INSERT under idx_kitchen_alerts_one_open_per_order.

    await client.query('COMMIT');

    order.items = validated;
    order.total_amount = parseFloat(order.total_amount);

    if (order.order_type !== 'counter') {
      socketHub.emitNewOrder(order);
    }

    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/orders ──────────────────────────────────────────────────────────
// Cashier: their own counter orders (filtered by range).
// Kitchen/Staff/Owner: all orders.
//
// Query params:
//   range  — 'today' | 'week' (legacy convenience filters)
//   from   — inclusive lower bound on created_at ('YYYY-MM-DD' or ISO datetime)
//   to     — inclusive upper bound on created_at (the whole day counts)
//   limit  — 1..MAX_ORDERS_LIMIT (default 200 — unchanged for cashier/kitchen)
//   offset — pagination offset, >= 0
// The manager dashboard reads `range=all&limit=10000` so its all-time
// aggregates are no longer silently truncated at 200 orders.
const MAX_ORDERS_LIMIT = 10000;

/**
 * Join the order's single most-recent payment, as `p`.
 *
 * Both `getOrders` and `getOrderReport` need one payment row per order, and
 * both filter on it, so it lives here rather than being written twice.
 *
 * A plain `LEFT JOIN payments ON order_id = o.id` looks equivalent but is not:
 * `payments` has no unique constraint on `order_id` (only its primary key), and
 * the one-row-per-order invariant is maintained by application code doing an
 * UPDATE. Nothing stops a second row appearing, and if one did, every outer
 * join would multiply the order and silently double any sum over it. The
 * LATERAL makes "latest payment" explicit and total.
 */
const LATEST_PAYMENT_JOIN = `
  LEFT JOIN LATERAL (
    SELECT status, method, paid_at, amount
    FROM payments
    WHERE order_id = o.id
    ORDER BY paid_at DESC NULLS LAST, id DESC
    LIMIT 1
  ) p ON TRUE`;

/**
 * True when the caller sent a full ISO datetime rather than a bare date.
 * Controls whether from/to is cast as ::timestamptz (client-supplied offset is
 * honoured) or ::date (interpreted in the server timezone).
 */
function isIsoDateTime(value) {
  return typeof value === 'string' && /T\d{2}:/.test(value);
}

/**
 * Escape LIKE wildcards so a literal `%` or `_` typed into the search box
 * matches itself instead of acting as a wildcard. Pairs with `ESCAPE '\'`.
 */
function escapeLike(term) {
  return term.replace(/[\\%_]/g, '\\$&');
}

/**
 * Build the WHERE clause shared by the order list and the sales report.
 *
 * Kept in one place because the two endpoints must agree on what a given
 * request covers: if the list says an order is "in the last 7 days" and the
 * report disagrees, the table and the charts on the same screen contradict each
 * other. Both were previously separate copies of this logic, and separate
 * copies are exactly how the date handling drifted out of sync before.
 *
 * Callers MUST join the latest payment as `p` (see LATEST_PAYMENT_JOIN) — the
 * payment filter reads it.
 *
 * Supported query params: `range`, `from`, `to`, `status`, `payment`, `search`.
 *
 * @returns {{ where: string, params: any[], nextIndex: number }}
 *   `nextIndex` is the next free placeholder number, for callers that append
 *   their own parameters (tz, limit, offset).
 */
function buildOrderFilters(req, { includeStatus = true } = {}) {
  const { range = 'today', status, payment, from, to, search } = req.query;
  const conditions = ['1=1'];
  const params = [];
  let p = 1;

  // Cashiers only ever see their own orders.
  if (req.user.role === 'cashier') {
    conditions.push(`o.cashier_id = $${p++}`);
    params.push(req.user.sub);
  }

  // Date range. An explicit from/to wins over the legacy `range` presets —
  // `range` defaults to 'today', so ANDing both would silently turn
  // "everything since 2020-01-01" into "only today".
  //
  // A date-only value ('2026-09-29') is cast as ::date, which Postgres
  // resolves in the *server's* timezone (Asia/Kuala_Lumpur). A full ISO
  // datetime carries the browser's own UTC offset, so casting it as
  // ::timestamptz preserves the client's calendar day exactly. The manager
  // pages send the latter, because otherwise "today" silently means
  // "today in Kuala Lumpur" and the browser and server disagree by a day
  // whenever either side is in a different zone.
  if (from || to) {
    if (from) {
      conditions.push(isIsoDateTime(from)
        ? `o.created_at >= $${p++}::timestamptz`
        : `o.created_at >= $${p++}::date`);
      params.push(from);
    }
    if (to) {
      if (isIsoDateTime(to)) {
        conditions.push(`o.created_at <= $${p++}::timestamptz`);
      } else {
        // Date-only `to` is inclusive of the whole day.
        conditions.push(`o.created_at < ($${p++}::date + INTERVAL '1 day')`);
      }
      params.push(to);
    }
  } else if (range === 'today') {
    conditions.push(`o.created_at >= CURRENT_DATE`);
  } else if (range === 'week') {
    conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '7 days'`);
  }

  // Status filter (comma-separated). Omitted by the report: revenue is defined
  // by payment state, not by an arbitrary status the viewer picked for the
  // table below it.
  if (includeStatus && status) {
    conditions.push(`o.status = ANY($${p++})`);
    params.push(status.split(',').map((s) => s.trim()));
  }

  // Payment method of the order's latest payment. 'all' is the UI's filter
  // for "any method", so it must not be treated as a literal method value.
  if (payment && payment !== 'all') {
    conditions.push(`p.method = $${p++}`);
    params.push(payment);
  }

  // Free-text search over the order number and any line-item name.
  //
  // Item names live on `menu_items`, not `order_items`, so this has to reach
  // through the join. LEFT JOIN rather than INNER so an order whose menu item
  // was later deleted is still findable by its order number — with an INNER
  // join, deleting a menu item would make every order containing it invisible
  // here, not just unsearchable.
  if (search && String(search).trim()) {
    const term = `%${escapeLike(String(search).trim())}%`;
    conditions.push(
      `('ORD-' || LPAD(o.id::text, 4, '0') ILIKE $${p} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM order_items soi
          LEFT JOIN menu_items smi ON smi.id = soi.menu_item_id
          WHERE soi.order_id = o.id
            AND smi.name ILIKE $${p} ESCAPE '\\'
        ))`
    );
    params.push(term);
    p++;
  }

  return { where: conditions.join(' AND '), params, nextIndex: p };
}

async function getOrders(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const { where, params } = buildOrderFilters(req);

    // Clamp rather than reject so a bad value can't blow up the query.
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_ORDERS_LIMIT)
      : 200;
    const parsedOffset = Number.parseInt(offset, 10);
    const safeOffset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    const { rows } = await db.query(
      `SELECT
         o.id,
         'ORD-' || LPAD(o.id::text, 4, '0') AS order_number,
         o.order_type,
         o.order_channel,
         o.status,
         o.total_amount::float,
         o.special_request,
         o.created_at,
         o.cashier_id,
         sa.full_name AS cashier_name,
         p.method     AS payment_method,
         p.status     AS payment_status,
         p.paid_at,
         p.amount     AS payment_amount,
         json_agg(
           json_build_object(
             'id',           oi.id,
             'menu_item_id', oi.menu_item_id,
             'name',         mi.name,
             'quantity',     oi.quantity,
             'unit_price',   oi.unit_price::float,
             'notes',        oi.notes,
             'option_name',  mo.name,
             'flavor_name',  mf.name
           ) ORDER BY oi.id
         ) AS items,
         -- Total matching orders, ignoring LIMIT/OFFSET, so a caller can page
         -- without a second round trip. Window functions run after grouping,
         -- so this counts orders, not line items.
         COUNT(*) OVER()::int AS total
       FROM orders o
       LEFT JOIN staff_accounts sa ON sa.id = o.cashier_id
       ${LATEST_PAYMENT_JOIN}
       JOIN order_items oi ON oi.order_id = o.id
       JOIN menu_items mi ON mi.id = oi.menu_item_id
       LEFT JOIN menu_item_options mo ON mo.id = oi.menu_item_option_id
       LEFT JOIN menu_item_options mf ON mf.id = oi.menu_item_flavor_id
       WHERE ${where}
       GROUP BY o.id, sa.full_name, p.method, p.status, p.paid_at, p.amount
       ORDER BY o.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    // `total` is identical on every row; hoist it out of the per-order payload.
    const total = rows.length ? rows[0].total : 0;
    for (const row of rows) delete row.total;

    res.json({ orders: rows, total });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/orders/totals ───────────────────────────────────────────────────
// All-time revenue collected and order count, in one row.
//
// The manager Dashboard used to derive "Total Revenue" by pulling the entire
// order history (up to 10 000 rows, each with json_agg'd line items) and
// summing it in the browser. This is the same number as a single aggregate row.
//
// "Revenue" here means money collected — a payment marked 'paid' on an order
// that was not cancelled. It is deliberately NOT `orders.status = 'completed'`.
// Nothing in the application ever sets that status: `updateOrderStatus` accepts
// it, but no screen offers it, so counting it reported ₱0 forever while the
// till held real cash. See the revenue note in getOrderReport.
//
// Declared before `/:id` in the router so "totals" is not parsed as an id.
async function getOrderTotals(req, res, next) {
  try {
    const params = [];
    let p = 1;
    let cashierScope = '';

    // Cashiers only see their own revenue.
    if (req.user.role === 'cashier') {
      cashierScope = `AND o.cashier_id = $${p++}`;
      params.push(req.user.sub);
    }

    const { rows } = await db.query(
      `SELECT
         COALESCE(SUM(p.amount), 0)::float AS total_revenue,
         COUNT(*)::int                      AS collected_orders
       FROM orders o
       ${LATEST_PAYMENT_JOIN}
       WHERE p.status = 'paid'
         AND o.status <> 'cancelled'
         ${cashierScope}`,
      params
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/orders/report ───────────────────────────────────────────────────
// Aggregates for the manager sales report, computed in SQL.
//
// The page used to download up to 2 000 orders on every poll and reduce over
// them in the browser to produce these numbers. That had two faults: it pulled
// the whole window with every line item attached four times a minute, and any
// period larger than the window silently reported a partial total.
//
// ── What "revenue" means here ──
// A payment marked 'paid' on an order that was not cancelled. This is
// intentionally different from `orders.status = 'completed'`, which is what the
// page previously counted. Nothing in the application ever sets 'completed' —
// `updateOrderStatus` accepts it, but no screen offers it — so the old
// definition reported ₱0 on a working till.
//
// Paid money on a cancelled order is excluded, so it currently appears in no
// figure at all: there is no refund concept in the schema. That is a known gap,
// see cancelOrder.
//
// Everything is scoped by the same buildOrderFilters the order list uses, so
// the table and the charts on the same screen cannot disagree.
async function getOrderReport(req, res, next) {
  try {
    // The status filter belongs to the transactions table, not the revenue
    // figures, so it is intentionally not part of the shared filter here.
    const { where, params, nextIndex } = buildOrderFilters(req, { includeStatus: false });

    // Bucket in the viewer's timezone, not the server's. The server defaults
    // to Asia/Manila and the client sends its own IANA zone; the client's zone
    // can differ from the server default if tz is passed explicitly. The client
    // should send a zone that matches its local calendar boundaries.
    const tzRaw = String(req.query.tz || '').trim();
    const tz = tzRaw && isValidTimeZone(tzRaw) ? tzRaw : DEFAULT_REPORT_TZ;

    const allParams = params;

    const { rows } = await db.query(
      `WITH base AS (
         SELECT
           o.id,
           o.status,
           p.amount::float                   AS total_amount,
           p.status                          AS pay_status,
           p.method                          AS pay_method,
           (p.paid_at AT TIME ZONE 'Asia/Manila')::timestamp AS local_ts
         FROM orders o
         ${LATEST_PAYMENT_JOIN}
         WHERE ${where}
       ),
       rev AS (
         SELECT * FROM base
         WHERE pay_status = 'paid' AND status <> 'cancelled'
       )
       SELECT
         (SELECT COALESCE(SUM(total_amount), 0)::float FROM rev)                  AS revenue,
         (SELECT COUNT(*)::int FROM rev)                                         AS order_count,
         (SELECT COUNT(*)::int FROM base WHERE status = 'cancelled')             AS cancelled_count,
         (SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json) FROM (
            SELECT pay_method AS method,
                   SUM(total_amount)::float AS amount,
                   COUNT(*)::int AS count
            FROM rev GROUP BY pay_method ORDER BY pay_method
          ) m)                                                                   AS method_split,
         (SELECT COALESCE(json_agg(row_to_json(d)), '[]'::json) FROM (
            SELECT to_char(local_ts, 'YYYY-MM-DD') AS day,
                   SUM(total_amount)::float AS revenue
            FROM rev GROUP BY 1 ORDER BY 1
          ) d)                                                                   AS daily,
         (SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT COALESCE(mi.name, 'Deleted item #' || oi.menu_item_id::text) AS name,
                   SUM(oi.quantity)::int AS qty
            FROM rev
            JOIN order_items oi ON oi.order_id = rev.id
            LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
            GROUP BY 1 ORDER BY qty DESC, name ASC LIMIT 6
          ) t)                                                                   AS top_items,
         (SELECT COALESCE(json_agg(row_to_json(h)), '[]'::json) FROM (
            SELECT EXTRACT(HOUR FROM local_ts)::int AS hour,
                   COUNT(*)::int AS orders,
                   SUM(total_amount)::float AS revenue
            FROM rev GROUP BY 1 ORDER BY 1
          ) h)                                                                   AS peak_hours`,
      allParams
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('getOrderReport error:', err);
    next(err);
  }
}

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────
async function getOrderById(req, res, next) {
  try {
    const { rows } = await db.query(
      `SELECT
         o.id,
         'ORD-' || LPAD(o.id::text, 4, '0') AS order_number,
         o.order_type, o.order_channel, o.status,
         o.total_amount::float, o.special_request, o.created_at,
         o.cashier_id, sa.full_name AS cashier_name,
         p.method AS payment_method, p.status AS payment_status, p.paid_at,
         p.amount AS payment_amount,
         json_agg(
           json_build_object(
             'id', oi.id, 'menu_item_id', oi.menu_item_id,
             'name', mi.name, 'quantity', oi.quantity,
             'unit_price', oi.unit_price::float, 'notes', oi.notes,
             'option_name', mo.name, 'flavor_name', mf.name
           ) ORDER BY oi.id
         ) AS items
        FROM orders o
        LEFT JOIN staff_accounts sa ON sa.id = o.cashier_id
        ${LATEST_PAYMENT_JOIN}
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        LEFT JOIN menu_item_options mo ON mo.id = oi.menu_item_option_id
        LEFT JOIN menu_item_options mf ON mf.id = oi.menu_item_flavor_id
        WHERE o.id = $1
        GROUP BY o.id, sa.full_name, p.method, p.status, p.paid_at, p.amount`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ message: 'Order not found.' });
    if (!ownsOrder(req, rows[0].cashier_id)) {
      return res.status(403).json(NOT_YOUR_ORDER);
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/orders/:id/status ────────────────────────────────────────────
async function updateOrderStatus(req, res, next) {
  const client = await db.getClient();
  try {
    const { status } = req.body;
    const VALID = ALL_STATUSES;
    if (!isKnownStatus(status)) {
      return res.status(400).json({ message: `status must be one of: ${VALID.join(', ')}` });
    }

    await client.query('BEGIN');

    // Lock the row and read the current status before writing. The UPDATE
    // below can't validate a transition on its own, and locking here is what
    // makes the read-then-write atomic against a concurrent status change.
    const { rows: current } = await client.query(
      `SELECT id, status, cashier_id FROM orders WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!current[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (!ownsOrder(req, current[0].cashier_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json(NOT_YOUR_ORDER);
    }

    const from = current[0].status;

    // Re-setting the status an order already has is a no-op, not an error.
    // Allowed so a retried request succeeds, but it skips the history insert
    // below so the audit trail doesn't gain a duplicate row.
    const unchanged = from === status;

    // Cancellation is deliberately NOT available here: PATCH used to accept it,
    // which let staff void a PAID order past the cancel route's money check.
    if (status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Use POST /api/orders/:id/cancel to cancel an order.',
      });
    }

    if (!unchanged && !canTransitionAs(req.user.role, from, status)) {
      await client.query('ROLLBACK');
      if (req.user.role === 'cashier' || req.user.role === 'kitchen_staff') {
        return res.status(403).json({
          message: "You don't have permission to perform this action.",
        });
      }
      if (!canTransition(from, status)) {
        return res.status(409).json({
          message: `Cannot move to "${status}" from "${from}".`,
        });
      }
    }

    if (unchanged) {
      const { rows: existing } = await client.query(
        `UPDATE orders SET updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );

    await client.query('COMMIT');
      const order = existing[0];
      order.order_number = orderNumber(order.id);
      order.total_amount = parseFloat(order.total_amount);
      // No socket emit: nothing actually changed for subscribers.
      return res.json(order);
    }

    const { rows } = await client.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, $2, $3)`,
      [req.params.id, status, req.user.sub]
    );

    await client.query('COMMIT');

    const order = rows[0];
    order.order_number = orderNumber(order.id);
    order.total_amount = parseFloat(order.total_amount);

    // Emit status update to all relevant rooms
    socketHub.emitOrderStatus({ orderId: order.id, orderNumber: order.order_number, status });
    if (status === 'ready') {
      socketHub.emitOrderReady({ orderId: order.id, orderNumber: order.order_number });
    }

    res.json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/orders/:id/cancel ─────────────────────────────────────────────
async function cancelOrder(req, res, next) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Lock the order row and read its latest payment in one statement.
    //
    // The lock matters: `POST /api/payments` locks the same order row, so this
    // read-then-write cannot interleave with a payment being recorded. Without
    // it, an order could be checked as unpaid, then paid, then cancelled — and
    // the report counts money only when the payment is 'paid' and the order is
    // not 'cancelled', so that payment would vanish from every figure.
    //
    // The payment lookup mirrors the ordering the sales report uses so both
    // agree on which row is "the" payment. A unique index on
    // payments(order_id) now guarantees there is only ever one.
    const { rows } = await client.query(
      `SELECT o.id, o.status, o.cashier_id,
              (SELECT p.status FROM payments p
                WHERE p.order_id = o.id
                ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
                LIMIT 1) AS payment_status
       FROM orders o
       WHERE o.id = $1
       FOR UPDATE`,
      [req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (!ownsOrder(req, rows[0].cashier_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json(NOT_YOUR_ORDER);
    }

    // Paid money cannot be voided by cancelling. There is no refund flow, so
    // cancelling here would leave the payment 'paid' against a 'cancelled'
    // order — excluded from revenue, absent from any refund figure, and
    // effectively unaccounted for. A manager has to resolve that deliberately.
    // NOTE: When a refund flow exists, it must reverse the inventory ledger
    // deducted by processPayment (e.g. an 'adjustment' or positive 'restock'
    // entry) for the order's items.
    if (rows[0].payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Cannot cancel an order that has already been paid. Process a refund instead.',
      });
    }

    const cancellable = ['pending', 'confirmed'];
    if (!cancellable.includes(rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Cannot cancel an order with status "${rows[0].status}".` });
    }

    await client.query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    await client.query(
      `INSERT INTO order_status_history (order_id, status, changed_by) VALUES ($1, 'cancelled', $2)`,
      [req.params.id, req.user.sub]
    );

    // Closing the order must also retire its buzzer: any open kitchen_alerts
    // row for it would otherwise keep flagging unpaid-and-cancelled work on the
    // ESP32 poll. Same transaction, so a cancel can never leave a stale alarm.
    const { rows: closedAlerts } = await client.query(
      `UPDATE kitchen_alerts
          SET acknowledged_at = NOW()
        WHERE order_id = $1 AND acknowledged_at IS NULL
        RETURNING id`,
      [req.params.id]
    );

    try {
      await client.query('SAVEPOINT sp_audit');
      await client.query(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
         VALUES ($1, 'order_cancelled', 'order', $2, $3)`,
        [req.user.sub, req.params.id, JSON.stringify({ status: 'cancelled' })]
      );
      await client.query('RELEASE SAVEPOINT sp_audit');
    } catch (err) {
      console.error('[audit_log] insert failed during cancel:', err);
      try { await client.query('ROLLBACK TO SAVEPOINT sp_audit'); } catch {}
    }

    await client.query('COMMIT');

    socketHub.emitOrderStatus({ orderId: rows[0].id, orderNumber: orderNumber(rows[0].id), status: 'cancelled' });
    for (const alert of closedAlerts) {
      socketHub.emitKitchenAlertAck({ alertId: alert.id });
    }

    res.json({ message: 'Order cancelled.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── PATCH /api/orders/:id/items ──────────────────────────────────────────────
// Cashier edited the draft after initial confirm (customer added/removed items).
// Replaces all order_items and recalculates total_amount.
// Only allowed while order is still 'confirmed' (not yet preparing/ready).
async function updateOrderItems(req, res, next) {
  const client = await db.getClient();
  try {
    const orderId = parseInt(req.params.id, 10);
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required and must not be empty.' });
    }

    await client.query('BEGIN');

    // 1. Check order exists and is still editable
    const { rows: orderRows } = await client.query(
      `SELECT o.id, o.status, o.cashier_id,
              (SELECT p.status FROM payments p
                WHERE p.order_id = o.id
                ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
                LIMIT 1) AS payment_status
         FROM orders o
         WHERE o.id = $1
         FOR UPDATE`,
      [orderId]
    );
    if (!orderRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (!ownsOrder(req, orderRows[0].cashier_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json(NOT_YOUR_ORDER);
    }
    // Only editable while still 'pending' (before kitchen acknowledges).
    // Once kitchen hits Acknowledge → 'confirmed', items are locked.
    if (orderRows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Cannot edit items — kitchen has already acknowledged this order (status: "${orderRows[0].status}").`,
      });
    }

    // Money already collected means the price is settled.
    //
    // The cashier normally pays at the counter while the order is still
    // 'pending' — the kitchen acknowledging it is what moves it to
    // 'confirmed'. So 'pending' alone does not mean "unpaid", and editing an
    // item after taking the cash rewrote `orders.total_amount` while
    // `payments.amount` kept the figure actually collected. Revenue sums
    // `orders.total_amount`, so a single edit inflated the till by the
    // difference (measured: PHP 80 collected reported as PHP 630).
    if (orderRows[0].payment_status === 'paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Cannot edit items — payment has already been collected for this order.',
      });
    }

// 2. Validate all items
    let totalAmount;
    let validated;
    try {
      ({ totalAmount, validated } = await priceCart(items));
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof CartError) return res.status(400).json({ message: err.message });
      throw err;
    }

    // 3. Delete old items, insert new ones
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
    for (const item of validated) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, menu_item_option_id, menu_item_flavor_id, quantity, unit_price, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, item.menu_item_id, item.menu_item_option_id, item.menu_item_flavor_id, item.quantity, item.unit_price, item.notes]
      );
    }

    // 4. Update total on the order
    const { rows } = await client.query(
      'UPDATE orders SET total_amount = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [totalAmount, orderId]
    );

    // 5. Update the pending payment amount to match
    await client.query(
      "UPDATE payments SET amount = $1 WHERE order_id = $2 AND status = 'pending'",
      [totalAmount, orderId]
    );

    await client.query('COMMIT');

    const order = rows[0];
    order.order_number = `ORD-${String(order.id).padStart(4, '0')}`;
    order.total_amount = parseFloat(order.total_amount);
    order.items = validated;

    res.json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { createOrder, getOrders, getOrderTotals, getOrderReport, getOrderById, updateOrderStatus, cancelOrder, updateOrderItems };

// Internal helpers, exposed for tests. They hold the rules that decide which
// orders count as revenue, so they are worth asserting directly — testing them
// through HTTP would only prove the numbers moved.
module.exports.__internal = { buildOrderFilters, escapeLike, isValidTimeZone, isIsoDateTime, LATEST_PAYMENT_JOIN, DEFAULT_REPORT_TZ };
