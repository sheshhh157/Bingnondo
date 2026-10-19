/**
 * oversightData.js — shared data logic for the admin oversight pages.
 *
 * This exists because three things had been copy-pasted across the oversight
 * views and quietly drifted apart:
 *
 *  1. Socket → state reducers. Every page declared its own inline `merge`
 *     functions for the same events, with three different ideas of what
 *     `order:status` should do to a kitchen queue.
 *  2. Selectors for counts shown in more than one place (out/low stock,
 *     counter vs online lanes, queue age).
 *  3. The 8 / 15 minute queue-age thresholds, plus the ticker that makes them
 *     flip on time — previously reimplemented with magic numbers in two files.
 *
 * Each socket event now has exactly one list reducer. A page only declares
 * which reducer applies to which part of its state.
 */

import { useEffect, useState } from 'react';
import { normalizeLiveOrder } from '../../utils/format';

// ── Constants shared with the backend ─────────────────────────────────────────

/**
 * Statuses the kitchen prep queue can contain. Mirrors GET /api/kitchen/orders
 * (which returns exactly these unless asked for the handoff queue too), so a
 * list filtered to these is always in step with a fresh fetch. Module-private.
 */
const QUEUE_STATUSES = ['pending', 'confirmed', 'preparing'];

/** Age thresholds, in minutes, for the nav badge and the kitchen cards. */
const URGENT_AFTER_MIN = 8;
const CRITICAL_AFTER_MIN = 15;

// ── List primitives ───────────────────────────────────────────────────────────

/** Prepend unless the id is already present — guards against duplicate pushes. */
const upsertFront = (list, item) =>
  list.some((x) => x.id === item.id) ? list : [item, ...list];

/**
 * Replace a matching row's fields. Only the defined keys are applied, so a
 * payload that omits a field leaves the stored value alone instead of
 * clearing it.
 */
const patchById = (id, changes) => (list) => {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return list;
  const defined = Object.fromEntries(
    Object.entries(changes).filter(([, v]) => v !== undefined)
  );
  const next = list.slice();
  next[i] = { ...next[i], ...defined };
  return next;
};

// ── Reducers: kitchen queue ───────────────────────────────────────────────────

export const queueUpsert = (list, p) => upsertFront(list, p);

/**
 * Statuses the kitchen *view* renders: the prep queue plus 'ready', which it
 * lists separately as awaiting handoff. `QUEUE_STATUSES` is the prep queue
 * alone, so the view needs its own allow-list rather than reusing it.
 */
const KITCHEN_VIEW_STATUSES = [...QUEUE_STATUSES, 'ready'];

/** Patch the status, but keep ready orders — the kitchen view shows them. */
export const queueStatusInView = (list, p) => {
  const patched = patchById(p.orderId, { status: p.status })(list);
  return patched.filter((o) => KITCHEN_VIEW_STATUSES.includes(o.status));
};

/**
 * `order:ready` for the kitchen view: an order that just went ready is still
 * relevant here (it now awaits handoff), so patch it to 'ready' rather than
 * dropping it. The payload carries no `status`, hence the literal.
 */
export const queueReady = (list, p) => {
  const patched = patchById(p.orderId, { status: 'ready' })(list);
  return patched.filter((o) => KITCHEN_VIEW_STATUSES.includes(o.status));
};

// ── Reducers: all-orders list (Sales, AdminOverview) ──────────────────────────

/** Live payloads may arrive in kitchen shape; normalize before storing. */
export const orderUpsert = (list, p) => {
  const order = normalizeLiveOrder(p);
  return order ? upsertFront(list, order) : list;
};

/** Every order ever, so no status filter — unlike the queue reducers. */
export const orderStatus = (list, p) => patchById(p.orderId, { status: p.status })(list);

// ── Reducers: inventory ───────────────────────────────────────────────────────

export const stockPatch = (list, p) =>
  patchById(p.itemId, { current_stock: p.currentStock, reorder_level: p.reorderLevel })(list);

// ── Reducers: menu catalog ────────────────────────────────────────────────────

/**
 * Menu updates arrive in two shapes — the full enriched item (create/update)
 * or the minimal `{ id, name, is_available }` (availability toggle) — so only
 * the defined fields are merged, exactly like `stockPatch`. Module-private:
 * reached through `MENU_EVENTS`.
 */
const menuPatch = (list, p) =>
  patchById(p.id, {
    is_available: p.is_available,
    name: p.name,
    price: p.price,
    category_name: p.category_name,
    ingredients: p.ingredients,
  })(list);

/** A menu item was deleted — drop it. Module-private; see MENU_EVENTS. */
const menuDrop = (list, p) => list.filter((m) => m.id !== p.id);

/** Names of linked ingredients at zero stock — why an item may be unavailable. */
export function outOfStockIngredients(item = {}) {
  return (item.ingredients || [])
    .filter((ing) => Number(ing.current_stock) <= 0)
    .map((ing) => ing.name);
}

// ── Event descriptors for useLiveData ─────────────────────────────────────────

/**
 * Event descriptor for a page whose state is the list itself
 * (OversightKitchen, OversightStocks, DeliveriesTab, SalesReportPage).
 */
export const listEvent = (name, reducer) => ({
  name,
  merge: (prev, p) => (p ? reducer(Array.isArray(prev) ? prev : [], p) : prev),
});

/**
 * Event descriptor for a page whose state is an object of named lists
 * (AdminOverview). `map` is
 * `{ stateKey: listReducer }`, so one event can update several keys at once —
 * a new order, for example, lands in both the sales list and the queue.
 */
export const keyEvent = (name, map) => ({
  name,
  merge: (prev, p) => {
    if (!p) return prev;
    const next = { ...prev };
    for (const [key, reducer] of Object.entries(map)) {
      next[key] = reducer(next[key] ?? [], p);
    }
    return next;
  },
});

/** The full set of events that touch a menu availability list. */
export const MENU_EVENTS = [
  listEvent('menu_update', menuPatch),
  listEvent('menu_item_deleted', menuDrop),
];

// ── Selectors ─────────────────────────────────────────────────────────────────

/** Out / low / in-stock counts plus the combined "needs attention" total. */
export function stockCounts(items = []) {
  let out = 0;
  let low = 0;
  for (const i of items) {
    if (i.current_stock <= 0) out += 1;
    else if (i.current_stock <= i.reorder_level) low += 1;
  }
  return { total: items.length, out, low, ok: items.length - out - low, alerts: out + low };
}

/**
 * Split the kitchen queue into the lanes the Kitchen view renders.
 *
 * Classification is by explicit allow-lists, not `channel !== 'mobile_app'`.
 * The negative test silently folded every unknown value — `null` on a legacy
 * row, a typo, a channel added later — into the counter lane, so a new channel
 * would inflate counter counts with no way to tell. Anything not recognised
 * lands in `unknown` and is reported separately instead of being guessed at.
 */
// Module-private: classification stays inside `splitByChannel`, so adding a
// channel is a one-file change rather than a set other pages can drift from.
const COUNTER_CHANNELS = new Set(['web_counter', 'counter']);
const ONLINE_CHANNELS = new Set(['mobile_app']);

export function splitByChannel(orders = []) {
  const counter = [];
  const online = [];
  const unknown = [];
  for (const o of orders) {
    const ch = o.order_channel;
    if (ONLINE_CHANNELS.has(ch)) online.push(o);
    else if (COUNTER_CHANNELS.has(ch)) counter.push(o);
    else unknown.push(o);
  }
  return { counter, online, unknown };
}

// ── Queue age ─────────────────────────────────────────────────────────────────

const ageMs = (dateStr, now) => now - new Date(dateStr).getTime();

/** 'normal' | 'urgent' | 'critical' — the kitchen card treatment. */
export function urgencyFor(dateStr, now = Date.now()) {
  const mins = ageMs(dateStr, now) / 60000;
  if (mins >= CRITICAL_AFTER_MIN) return 'critical';
  if (mins >= URGENT_AFTER_MIN) return 'urgent';
  return 'normal';
}

/** Compact age label, e.g. 45s / 12m / 1h 4m. */
export function elapsedSince(dateStr, now = Date.now()) {
  const secs = Math.floor(ageMs(dateStr, now) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

/**
 * Ticking clock so age-derived UI (urgency colours, "Overdue" flags) updates
 * on its own instead of only when a socket event happens to arrive.
 */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
