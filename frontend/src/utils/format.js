// Shared formatting/status helpers for the manager dashboard.

export function currency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "hh:mm:ss" clock shared by the live "updated / synced" stamps. */
export function timeStamp(d) {
  return new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Stable `YYYY-MM-DD` key for a date, in the *browser's* local calendar.
 *
 * Day bucketing used to key on `toLocaleDateString(..., { weekday: 'short' })`,
 * which has two bugs: a 7-day window spanning a year boundary folded two
 * different days into the same "Sun" bucket, and the locale-formatted string
 * cannot be reliably re-parsed for sorting. A plain ISO-ish key is unique per
 * calendar day and sorts lexicographically in chronological order.
 */
export function dayKey(d) {
  const date = d instanceof Date ? d : new Date(d);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

/**
 * Inclusive bounds of a local calendar day, as ISO datetimes.
 *
 * `toISOString()` normalises to UTC, but the instant is preserved, and the
 * backend casts these as `timestamptz` — so "today" means today where the
 * manager is sitting, not today in the server's timezone.
 */
export function localDayBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Bounds of the last `days` calendar days, oldest first, ending today. */
export function lastDaysBounds(days, d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (days - 1), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Translate a report period key into server-side date bounds.
 *
 * Every manager period picker resolves through this one function so the
 * dashboard, oversight and sales report can't disagree about what "this week"
 * means. Each previously re-implemented its own start-of-day arithmetic, and
 * the sales report's version did the maths in whole 24-hour chunks from a
 * "now" captured at mount — which drifts by an hour twice a year and is wrong
 * for any period after a DST transition.
 *
 *   today  → local midnight to local end of today
 *   week   → local Sunday through today
 *   7d     → the last 7 calendar days ending today
 *   30d    → the last 30 calendar days ending today
 *   all    → unbounded (no `from`, so the caller must not send one)
 *   custom → the two date inputs, each end inclusive; either may be omitted
 *            to leave that side open
 *
 * @returns {{from?: string, to?: string, label: string, bounded: boolean}}
 */
export function periodBounds(period, { customStart, customEnd, now = new Date() } = {}) {
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const to = endOfToday.toISOString();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case 'today':
      return { from: midnight.toISOString(), to, label: 'Today', bounded: true };

    case 'week': {
      const start = new Date(midnight);
      start.setDate(start.getDate() - start.getDay());
      return { from: start.toISOString(), to, label: 'This week', bounded: true };
    }

    case '7d':
      return { ...lastDaysBounds(7, now), label: 'Last 7 days', bounded: true };

    case '30d':
      return { ...lastDaysBounds(30, now), label: 'Last 30 days', bounded: true };

    case 'custom': {
      const out = { label: 'Custom', bounded: Boolean(customStart || customEnd) };
      // Date-only strings are expanded to whole local days, then sent as
      // instants so the server's timezone can't shift the boundary.
      if (customStart) out.from = new Date(`${customStart}T00:00:00`).toISOString();
      if (customEnd) out.to = new Date(`${customEnd}T23:59:59.999`).toISOString();
      return out;
    }

    case 'all':
    default:
      return { label: 'All time', bounded: false };
  }
}

export function stockStatus(current, reorder) {
  if (current <= 0) return 'out';
  if (current <= reorder) return 'low';
  return 'ok';
}

export const STATUS_LABEL = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  preparing: 'Preparing',
  confirmed: 'Confirmed',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  pending: 'Pending',
};

// Delivery status → Badge variant
export function deliveryBadgeVariant(status) {
  switch (status) {
    case 'delivered': return 'success';
    case 'out_for_delivery': return 'info';
    case 'ready': return 'success';
    case 'preparing': return 'gold';
    default: return 'muted';
  }
}

// Inventory status → Badge variant
export function stockBadgeVariant(status) {
  switch (status) {
    case 'ok': return 'success';
    case 'low': return 'warning';
    case 'out': return 'danger';
    default: return 'muted';
  }
}

/** 'out' | 'low' | 'ok' → the human label on inventory status badges. */
export function stockStatusText(status) {
  switch (status) {
    case 'out': return 'Out of stock';
    case 'low': return 'Low stock';
    default: return 'In stock';
  }
}

/** Menu item availability → Badge variant. */
export function menuAvailVariant(isAvailable) {
  return isAvailable ? 'success' : 'danger';
}

// Kitchen order status → Badge variant.
// 'ready' needs its own case: it is finished in the kitchen, not work in
// progress, so it reads as success rather than the gold used for incoming work.
export function kitchenBadgeVariant(status) {
  if (status === 'preparing' || status === 'ready') return 'success';
  return 'gold';
}

/** Kitchen queue status → the header label on the manager kitchen cards. */
export function kitchenStatusText(status) {
  if (status === 'preparing') return 'Preparing';
  if (status === 'ready') return 'Ready';
  return 'Incoming';
}

// Normalize a live `order:new` socket payload (kitchen-order shape with
// `order_items: [{ quantity, menu_item: { name } }]`, no payment/total)
// into the `orders` array shape (`items`, `payment_method`, `total_amount`)
// so new live orders render correctly in charts, tables, and drill-downs.
// Payloads already in order shape pass through untouched.
export function normalizeLiveOrder(p) {
  if (!p || typeof p !== 'object') return null;
  if (Array.isArray(p.items)) return p;
  const items = (p.order_items || []).map((it) => ({
    name: it?.menu_item?.name || it?.name || 'Unknown',
    quantity: it?.quantity || 1,
    unit_price: it?.unit_price ?? null,
  }));
  return {
    ...p,
    items,
    payment_method: p.payment_method || 'cash',
    total_amount: p.total_amount ?? p.order_total ?? 0,
  };
}
