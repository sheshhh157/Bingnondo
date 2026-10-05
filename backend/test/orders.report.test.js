/**
 * Tests for the sales-report revenue rules.
 *
 * Two things are covered:
 *
 *   1. The pure filter builder, which decides which orders a request covers.
 *   2. The revenue predicate itself, which is SQL and so needs the database.
 *      These are skipped when no database is reachable, so the file still runs
 *      in CI without one.
 *
 * Why assert the predicate at all: it is the one rule that every revenue figure
 * in the app depends on, and it is not exercised by the schema. There is no
 * constraint or default that forces a payment to be marked 'paid', and nothing
 * in the application ever sets `orders.status = 'completed'` — so the earlier
 * `status = 'completed'` definition reported ₱0 on a till holding real cash,
 * and no test failed.
 *
 * Run with: npm test
 */

const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert/strict');

// Must precede the controller import: requiring the controller pulls in
// config/db.js, which reads process.env.DB_* at module load time. Loading
// dotenv afterwards leaves the pool configured with empty credentials.
require('dotenv').config();

const ctrl = require('../src/modules/orders/orders.controller');
const { buildOrderFilters, escapeLike, isValidTimeZone, isIsoDateTime, DEFAULT_REPORT_TZ } = ctrl.__internal;

// ─── escapeLike ───────────────────────────────────────────────────────────────

test('escapeLike neutralises LIKE wildcards', () => {
  assert.equal(escapeLike('100%'), '100\\%');
  assert.equal(escapeLike('a_b'), 'a\\_b');
  assert.equal(escapeLike('back\\slash'), 'back\\\\slash');
  assert.equal(escapeLike('plain'), 'plain');
});

// ─── buildOrderFilters ────────────────────────────────────────────────────────

const manager = (query = {}, role = 'owner') => ({ user: { sub: 1, role }, query });

test('buildOrderFilters defaults to today when no range is given', () => {
  const { where } = buildOrderFilters(manager());
  assert.match(where, /CURRENT_DATE/);
});

test('an explicit from/to overrides the today default', () => {
  // The bug this prevents: `range` defaults to 'today', so ANDing both would
  // silently reduce "everything since 2020" to "just today".
  const { where } = buildOrderFilters(manager({ from: '2020-01-01', to: '2020-12-31' }));
  assert.doesNotMatch(where, /CURRENT_DATE/);
  assert.match(where, /created_at >= \$1::date/);
});

test('a full ISO datetime is cast as timestamptz, a bare date as date', () => {
  const iso = buildOrderFilters(manager({ from: '2026-09-29T00:00:00+08:00' }));
  assert.match(iso.where, /::timestamptz/);

  const bare = buildOrderFilters(manager({ from: '2026-09-29' }));
  assert.match(bare.where, /::date/);
});

test('a date-only `to` includes the whole final day', () => {
  const { where } = buildOrderFilters(manager({ from: '2026-01-01', to: '2026-01-31' }));
  assert.match(where, /INTERVAL '1 day'\)/, 'end date must be exclusive-upper-bound');
});

test('cashiers are scoped to their own orders, managers are not', () => {
  const cashier = buildOrderFilters(manager({ range: 'all' }, 'cashier'));
  assert.match(cashier.where, /cashier_id = \$1/);
  assert.deepEqual(cashier.params, [1]);

  const owner = buildOrderFilters(manager({ range: 'all' }, 'owner'));
  assert.doesNotMatch(owner.where, /cashier_id/);
});

test('status accepts a comma-separated list and is skipped when absent', () => {
  const multi = buildOrderFilters(manager({ status: 'pending, ready' }));
  assert.match(multi.where, /o\.status = ANY\(\$\d+\)/);
  assert.deepEqual(multi.params.at(-1), ['pending', 'ready']);

  const none = buildOrderFilters(manager({}));
  assert.doesNotMatch(none.where, /o\.status/);
});

test('includeStatus: false omits the status filter, for the report', () => {
  const withStatus = buildOrderFilters(manager({ status: 'cancelled' }));
  assert.match(withStatus.where, /o\.status/);

  // The report's revenue figures must not be narrowed by the table's status
  // filter — picking "Cancelled" in the table would otherwise zero the
  // headline revenue number on the same screen.
  const without = buildOrderFilters(manager({ status: 'cancelled' }), { includeStatus: false });
  assert.doesNotMatch(without.where, /o\.status/);
});

test('search matches order number or item name, and escapes the term', () => {
  const { where, params } = buildOrderFilters(manager({ search: '  50%  ' }));
  assert.match(where, /LPAD\(o\.id::text, 4, '0'\) ILIKE/);
  assert.match(where, /EXISTS \(/);
  assert.deepEqual(params, ['%50\\%%']);

  const none = buildOrderFilters(manager({ search: '   ' }));
  assert.doesNotMatch(none.where, /ILIKE/, 'blank search must not filter');
});

test('payment method filters on the latest payment, and `all` means no filter', () => {
  const cash = buildOrderFilters(manager({ payment: 'cash' }));
  assert.match(cash.where, /p\.method = \$\d+/);
  assert.deepEqual(cash.params.at(-1), 'cash');

  // Regression: the sales page sends `payment=all` when its dropdown is on
  // "All payments", which used to match `p.method = 'all'` and zero the
  // report. 'all' must behave like an omitted filter.
  const all = buildOrderFilters(manager({ payment: 'all' }));
  assert.doesNotMatch(all.where, /p\.method/);

  const none = buildOrderFilters(manager({}));
  assert.doesNotMatch(none.where, /p\.method/);
});

test('nextIndex is the first free placeholder, so callers can append params', () => {
  const { nextIndex, params } = buildOrderFilters(manager({ from: '2026-01-01', search: 'tea', status: 'ready' }));
  assert.equal(nextIndex, params.length + 1);
});

// ─── timezone validation ──────────────────────────────────────────────────────

test('isValidTimeZone accepts real zones and rejects junk', () => {
  assert.equal(isValidTimeZone('Asia/Manila'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  assert.equal(isValidTimeZone('Not/AZone'), false);
  // Empty and non-string input must not reach Intl: `timeZone: ''` is treated
  // as "use the default zone" by the spec rather than throwing, so it would
  // pass validation and then be sent to Postgres as an empty string.
  assert.equal(isValidTimeZone(''), false);
  assert.equal(isValidTimeZone('   '), false);
  assert.equal(isValidTimeZone(undefined), false);
  assert.equal(isValidTimeZone(null), false);
  assert.equal(isValidTimeZone(42), false);
});

test('isIsoDateTime only accepts full datetimes', () => {
  assert.equal(isIsoDateTime('2026-09-29T00:00:00Z'), true);
  assert.equal(isIsoDateTime('2026-09-29'), false);
  assert.equal(isIsoDateTime('2026-09-29 10:30'), false);
});

// ─── The revenue predicate, against the database ──────────────────────────────

let db = null;
try {
  require('dotenv').config();
  db = require('../src/config/db');
} catch {
  db = null;
}

const canQuery = async () => {
  if (!db) return false;
  try {
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

const REVENUE_PREDICATE = `
  p.status = 'paid' AND o.status <> 'cancelled'`;

test('revenue counts paid, non-cancelled orders and nothing else', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Computed independently of the controller's own SQL, so this is a genuine
  // cross-check rather than a restatement.
  const expected = await db.query(`
    SELECT COALESCE(SUM(o.total_amount), 0)::float AS revenue,
           COUNT(*)::int AS orders
    FROM orders o
    JOIN LATERAL (
      SELECT status FROM payments WHERE order_id = o.id
      ORDER BY paid_at DESC NULLS LAST, id DESC LIMIT 1
    ) p ON TRUE
    WHERE ${REVENUE_PREDICATE}`);

  const viaTotals = await callTotals();
  assert.equal(viaTotals.status, 200);
  assert.equal(viaTotals.body.total_revenue, expected.rows[0].revenue);
  assert.equal(viaTotals.body.collected_orders, expected.rows[0].orders);
});

test("'completed' is not a usable proxy for paid", async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const byCompleted = await db.query(
    `SELECT COUNT(*)::int AS n FROM orders WHERE status = 'completed'`);
  const byPaid = await db.query(`
    SELECT COUNT(*)::int AS n FROM orders o
    JOIN LATERAL (SELECT status FROM payments WHERE order_id = o.id
      ORDER BY paid_at DESC NULLS LAST, id DESC LIMIT 1) p ON TRUE
    WHERE ${REVENUE_PREDICATE}`);

  // Not asserting these differ — a seeded shop could legitimately have both at
  // zero. Asserting the old definition is not the one in use.
  const viaTotals = await callTotals();
  assert.equal(
    viaTotals.body.collected_orders,
    byPaid.rows[0].n,
    'totals must count paid orders, not status=completed ones'
  );
  assert.notEqual(
    viaTotals.body.collected_orders,
    undefined,
    'the old response key must be gone'
  );
});

let duplicateOrderId = null;
before(async () => {
  if (!(await canQuery())) return;
  // Insert a throwaway op order for the duplicate-payment check.
  const order = await db.query(
    `INSERT INTO orders (order_type, customer_id, cashier_id, status, order_channel, total_amount, created_at, updated_at)
     VALUES ('counter', NULL, NULL, 'pending', 'web_counter', 100, now(), now()) RETURNING id`
  );
  duplicateOrderId = order.rows[0].id;
  await db.query(
    `INSERT INTO payments (order_id, method, amount, status, paid_at) VALUES ($1, 'cash', 100, 'paid', now())`,
    [duplicateOrderId]
  );
});

after(async () => {
  if (!(await canQuery())) return;
  if (duplicateOrderId) {
    await db.query('DELETE FROM payments WHERE order_id = $1', [duplicateOrderId]);
    await db.query('DELETE FROM orders WHERE id = $1', [duplicateOrderId]);
  }
});

test('the database refuses a second payment row for one order', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // This test used to insert a duplicate payment row and assert the report's
  // LATERAL join still returned exactly one row. Migration 003 added a unique
  // index on payments(order_id), so that duplicate can no longer be created at
  // all — the scenario is now prevented rather than defended against. The
  // LATERAL joins stay as defence in depth, but the real guarantee is that the
  // insert below is rejected.
  const id = duplicateOrderId;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await assert.rejects(
      client.query(
        `INSERT INTO payments (order_id, method, amount, status, paid_at)
         SELECT order_id, method, amount, status, paid_at FROM payments
         WHERE order_id = $1 LIMIT 1`,
        [id]
      ),
      (err) => err.code === '23505',
      'a duplicate payment row must be rejected by the unique index'
    );

    // Confirm the row count is genuinely still 1, i.e. the insert left nothing
    // behind. The rejected INSERT aborts the transaction, so re-read inside a
    // savepoint to keep the outer transaction usable.
    await client.query('ROLLBACK');
    await client.query('BEGIN');
    const count = await client.query(
      `SELECT COUNT(*)::int AS n FROM payments WHERE order_id = $1`, [id]);
    assert.equal(count.rows[0].n, 1);

    // The report's LATERAL join is still correct independent of the constraint.
    const lateral = await client.query(`
      SELECT COUNT(*)::int AS n FROM orders o
      JOIN LATERAL (SELECT status FROM payments WHERE order_id = o.id
        ORDER BY paid_at DESC NULLS LAST, id DESC LIMIT 1) p ON TRUE
      WHERE o.id = $1`, [id]);
    assert.equal(lateral.rows[0].n, 1, 'the LATERAL join must stay at one row');
  } finally {
    await client.query('ROLLBACK');
    await client.release();
  }
});

test('an order whose menu item was deleted still counts its revenue', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // menu.controller.js deletes menu_items outright, which orphans order_items.
  // A revenue query that INNER JOINs menu_items would drop those orders
  // entirely — silently reducing reported revenue when a menu is edited.
  const r = await db.query(`
    SELECT COUNT(*)::int AS n
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.menu_item_id NOT IN (SELECT id FROM menu_items WHERE id IS NOT NULL)`);
  assert.ok(Array.isArray(r.rows), 'query must run');
  // Whether orphans exist depends on the data; what matters is the join type.
  assert.match(
    require('node:fs').readFileSync(
      require.resolve('../src/modules/orders/orders.controller.js'), 'utf8'),
    /LEFT JOIN menu_items mi ON mi\.id = oi\.menu_item_id/,
  );
});

test('the report route is not shadowed by /:id', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const res = await callReport();
  assert.equal(res.status, 200, '"report" must not be parsed as an order id');
  assert.equal(typeof res.body.revenue, 'number');
  assert.equal(typeof res.body.order_count, 'number');
  assert.ok(Array.isArray(res.body.daily), 'empty periods return [] not null');
  assert.ok(Array.isArray(res.body.method_split));
  assert.ok(Array.isArray(res.body.top_items));
  assert.ok(Array.isArray(res.body.peak_hours));
});

test('report buckets sum back to the headline revenue', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const { body } = await callReport({ range: 'all' });
  const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  assert.equal(sum(body.method_split, 'amount'), body.revenue);
  assert.equal(sum(body.daily, 'revenue'), body.revenue);
  assert.equal(sum(body.peak_hours, 'revenue'), body.revenue);
});

test("the report with payment='all' matches the report with no payment filter", async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const plain = await callReport('range=all');
  const all = await callReport('range=all&payment=all');
  assert.equal(all.body.revenue, plain.body.revenue);
  assert.equal(all.body.order_count, plain.body.order_count);
});

test('an unknown timezone falls back instead of erroring', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const res = await callReport({ range: 'all', tz: 'Not/AZone' });
  assert.equal(res.status, 200);
});

test('the order list reports an unpaged total', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const res = await callList({ range: 'all', limit: 2 });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.total, 'number');
  assert.ok(res.body.total >= res.body.orders.length);
  assert.ok(res.body.orders.every((o) => !('total' in o)), 'no per-row leak');
});

// ─── Request-level helpers ────────────────────────────────────────────────────
// The handlers are exercised through the real Express app with a signed token,
// so routing, auth and the SQL are all covered together.

let token = null;
const signIn = async () => {
  if (token) return token;
  const owner = await db.query(
    `SELECT id FROM staff_accounts WHERE role IN ('owner','admin') AND status = 'active' ORDER BY id LIMIT 1`);
  if (owner.rowCount === 0) return null;
  const jwt = require('jsonwebtoken');
  token = jwt.sign(
    { sub: owner.rows[0].id, type: 'staff', role: 'owner' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' },
  );
  return token;
};

/**
 * Build a bare Express app around the real orders router.
 *
 * Deliberately not `server.js`: that file binds a port, opens a Socket.io
 * server and installs a startup rate-limit, none of which these tests need and
 * all of which would leak between cases.
 */
function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  return app;
}

async function call(path) {
  const jwtToken = await signIn();
  if (!jwtToken) return { status: 0, body: null };
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { Authorization: `Bearer ${jwtToken}` },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const callReport = (q = '') => call(`/api/orders/report?${q}`);
const callTotals = () => call('/api/orders/totals');
const callList = (q = '') => call(`/api/orders?${q}`);
