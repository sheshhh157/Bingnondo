/**
 * managerApi.js — Real API calls for the Manager dashboard.
 *
 * The manager dashboard is strictly read-only and consumes the same DB-backed
 * endpoints as the rest of the staff app. Requests go through apiClient so the
 * Bearer JWT is attached and a 401 triggers a silent refresh + redirect.
 *
 * Backend response shapes, and how they are adapted for the manager pages:
 *
 *   GET  /api/orders            → { orders: [...], total }
 *     `ordersAPI.getRange` returns `{ data, total }`; the pages treat `data` as
 *     an array. `from`/`to`/`limit`/`offset` do the filtering and paging in
 *     Postgres, and `total` is the unpaged match count, so no page pulls the
 *     whole order history to know how many pages there are.
 *
 *   GET  /api/orders/totals     → { total_revenue, collected_orders }
 *     Single aggregate row backing the Dashboard's all-time KPI.
 *
 *   GET  /api/orders/report      → { revenue, order_count, cancelled_count,
 *                                       method_split, daily, top_items,
 *                                       peak_hours }
 *     Every figure the sales report shows, computed in Postgres.
 *
 *   GET  /api/inventory         → { items: [...] }
 *     (pages do `data.items || data`, so { data: res } works unchanged)
 *
 *   GET  /api/kitchen/orders    → { data: [...] }
 *     The kitchen prep queue. `?include_ready=1` widens it to the handoff
 *     queue; only OversightKitchen asks for that.
 *
 * Every function keeps the `{ data: ... }` wrapper so ManagerLayout,
 * DashboardPage, SalesReportPage, OversightKitchen, OversightStocks,
 * OversightDelivery and MenuPage need no changes.
 */

import { get } from './apiClient';

/**
 * IANA timezone of the browser, for server-side day/hour bucketing.
 *
 * The backend groups revenue into calendar days and hours for the sales report.
 * Doing that in the database means it has to know *which* day is "today" to the
 * person looking at the screen. Sending the browser's own zone keeps the
 * report's day boundary aligned with the filter pickers above it, instead of
 * inheriting the server's zone.
 */
function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Page sizes for manager order reads.
 *
 * The pages used to request `limit=10000` and aggregate in the browser. These
 * are the bounded sizes that replaced it — see `ordersAPI.getRange`. The
 * backend still clamps any single read at 10 000, but nothing asks for that
 * any more.
 */
export const MANAGER_ORDER_LIMITS = {
  /** Oversight "today" pulse and the Dashboard's bounded window. */
  window: 2000,
  /** Sales report transactions table, one page at a time. */
  page: 50,
};



// ─── Orders / sales ───────────────────────────────────────────────────────────
export const ordersAPI = {
  /**
   * Orders, newest first, optionally narrowed server-side.
   *
   * The pages used to request `range=all&limit=10000` and aggregate in the
   * browser. That pulled the entire order history — each row carrying
   * json_agg'd line items — into the tab on every poll, and silently truncated
   * every aggregate once the shop passed the limit. Filtering and paging now
   * happen in Postgres via the endpoint's existing `from`/`to`/`limit`/`offset`.
   *
   * `from`/`to` should be full ISO datetimes (see `localDayBounds` in
   * utils/format) so the server honours the browser's timezone; a bare
   * 'YYYY-MM-DD' is interpreted in the server's timezone instead.
   *
   * @param {string} [search] Match order number or line-item name, server-side.
   * @returns {{ data: object[], total: number }} `total` is the number of
   *   matching orders ignoring `limit`/`offset`, so a caller can build a pager
   *   without downloading every page.
   */
  getRange: async ({ from, to, limit, offset = 0, status, payment, search } = {}) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (status) q.set('status', status);
    if (payment) q.set('payment', payment);
    if (search && search.trim()) q.set('search', search.trim());
    if (Number.isFinite(limit)) q.set('limit', String(limit));
    if (offset > 0) q.set('offset', String(offset));
    // `range=all` is still sent so the endpoint's legacy `today` default never
    // applies; the explicit from/to or limit alone is not enough, because with
    // no date bounds an omitted range silently narrows results to today.
    q.set('range', 'all');
    const res = await get(`/api/orders?${q.toString()}`);
    return { data: res.orders || [], total: res.total ?? 0 };
  },

  /**
   * All-time revenue collected and order count in a single aggregate row.
   * Keeps the Dashboard's all-time KPI correct now that its own order fetch is
   * bounded to a recent window.
   */
  getTotals: async () => {
    const res = await get('/api/orders/totals');
    return { data: res };
  },

  /**
   * Sales report aggregates, computed server-side.
   *
   * The page used to download the whole period (up to 2 000 orders, each with
   * its line items) on every poll and reduce over it in the browser for six
   * separate figures. That was both wasteful and wrong: the figures were only
   * as complete as the row limit, so a 90-day view silently reported the totals
   * of the most recent 2 000 orders.
   *
   * @param {object} opts
   * @param {string} [opts.from] ISO datetime bounding the period start.
   * @param {string} [opts.to]   ISO datetime bounding the period end.
   * @param {string} [opts.payment] Restrict to one payment method.
   * @param {string} [opts.search] Match order number or line-item name.
   * @returns {{ data: object }} The aggregate row, `data` kept for symmetry with
   *   the other `ordersAPI` helpers.
   */
  getReport: async ({ from, to, payment, search } = {}) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (payment) q.set('payment', payment);
    if (search && search.trim()) q.set('search', search.trim());
    q.set('range', 'all');
    const tz = viewerTimeZone();
    if (tz) q.set('tz', tz);
    const res = await get(`/api/orders/report?${q.toString()}`);
    return { data: res };
  },
};

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryAPI = {
  getAll: async () => {
    const res = await get('/api/inventory');
    return { data: res };
  },
  /** Movement history for one ingredient (restock / deduction / adjustment). */
  getTransactions: async (id) => {
    const res = await get(`/api/inventory/${id}/transactions`);
    return { data: res.transactions || [] };
  },
};

// ─── Kitchen ──────────────────────────────────────────────────────────────────
export const kitchenAPI = {
  /**
   * Orders in 'pending' | 'confirmed' | 'preparing' — the live prep queue.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.includeReady] Also return 'ready' orders. The
   *   manager needs these to see what is waiting on a handoff; the kitchen
   *   omits them by design and passes nothing.
   */
  getOrders: async ({ includeReady = false } = {}) => {
    const q = includeReady ? '?include_ready=1' : '';
    const res = await get(`/api/kitchen/orders${q}`);
    return { data: res.data || [] };
  },
  /** Unacknowledged kitchen alerts — read-only for the manager (ack is kitchen-side). */
  getAlerts: async () => {
    const res = await get('/api/kitchen/alerts');
    return { data: res.data || [] };
  },
};

// ─── Delivery ─────────────────────────────────────────────────────────────────
// No delivery backend exists yet (no `deliveries` table, controller or route),
// so there is nothing real to read. The page renders its empty state until one
// is built. Replace this with a real `get('/api/deliveries')` call at that point.
export const deliveryAPI = {
  getAll: async () => ({ data: [] }),
};

// ─── Menu catalog ─────────────────────────────────────────────────────────────
// GET /api/menu/staff only requires `staff` (the manager account passes), and
// every menu edit is broadcast to all rooms as menu_update / menu_item_deleted,
// so a read-only availability view needs no backend change.
export const menuAPI = {
  /** All menu items, enriched with category name + linked ingredient stocks. */
  getStaffMenu: async () => {
    const res = await get('/api/menu/staff');
    return { data: res.items || [] };
  },
};

export default { ordersAPI, inventoryAPI, kitchenAPI, deliveryAPI, menuAPI };
