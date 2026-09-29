// ─── Order status transitions ─────────────────────────────────────────────────
//
// Single source of truth for how an order may move between statuses.
//
// Two endpoints mutate `orders.status` and previously disagreed about the
// rules: the kitchen endpoint hand-enforced `confirmed -> preparing -> ready`,
// while `PATCH /api/orders/:id/status` validated nothing at all and accepted
// any status from any state. This table is now the only definition.
//
// Kept here rather than in either controller so the rules cannot drift apart
// again. Both callers pass the status they read inside their own transaction.

/**
 * Allowed target statuses for each source status.
 *
 * - Cancellation is only permitted before the kitchen starts cooking
 *   (pending / confirmed). Once an order is `preparing` the food is committed,
 *   so voiding it is a business decision, not a technical one.
 * - `completed` is reachable only from `ready` or `out_for_delivery`. Nothing
 *   in the app currently writes `completed` — the kitchen stops at `ready` and
 *   the delivery page is not backed by a real endpoint — so these entries are
 *   unused today. They are here so the rules are already correct if a
 *   completion action is added, rather than needing to be revisited then.
 * - Terminal states map to an empty list: no further transitions are legal.
 */
const TRANSITIONS = {
  pending:          ['confirmed', 'cancelled'],
  confirmed:        ['preparing', 'cancelled'],
  preparing:        ['ready'],
  ready:            ['out_for_delivery', 'completed'],
  out_for_delivery: ['completed'],
  completed:        [],
  cancelled:        [],
};

/** Every status the `orders_status_check` constraint accepts. */
const ALL_STATUSES = Object.keys(TRANSITIONS);

/** True when `to` is a status the `orders_status_check` constraint allows. */
const isKnownStatus = (to) => Object.prototype.hasOwnProperty.call(TRANSITIONS, to);

/**
 * True when an order may move from `from` to `to`.
 *
 * Rejects unknown statuses, backward moves (`ready -> preparing`), and any
 * move out of a terminal state. Same-to-same is deliberately false: callers
 * handle an idempotent re-set separately so a no-op does not write a second
 * `order_status_history` row.
 */
const canTransition = (from, to) =>
  isKnownStatus(to) && (TRANSITIONS[from] || []).includes(to);

module.exports = { TRANSITIONS, ALL_STATUSES, isKnownStatus, canTransition };
