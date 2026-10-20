const db = require('../../config/db');
const {
  NOTIFICATION_CATEGORIES,
  readNotificationSettings,
} = require('./notificationSettings');

// Feed assembly constants. Each source gets its own cap so the merged stream
// stays representative; the response is sliced to the caller's `limit`.
const PER_SOURCE_LIMIT = 60;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_UNREAD = 99;

const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

const METHOD_LABELS = { gcash: 'GCash', cash: 'Cash', cash_on_delivery: 'COD' };

const VIOLATION_LABELS = {
  no_show: 'No-show',
  cancelled_before_prep: 'Cancelled before prep',
  cancelled_after_prep: 'Cancelled after prep',
};

/** 'update_business_hours' → 'Update business hours' */
function humanizeAction(action) {
  const words = String(action || 'activity').split('_').filter(Boolean);
  if (words.length === 0) return 'Activity';
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// ─── Per-category event sources ───────────────────────────────────────────────
// Row shape: { id, category, type, title, body: string|null, at: Date, link }

async function orderEvents() {
  const [created, cancelled] = await Promise.all([
    db.query(
      `SELECT id, COALESCE(order_number, '#' || id) AS order_number, order_type, total_amount, created_at
       FROM orders
       ORDER BY created_at DESC
       LIMIT $1`,
      [PER_SOURCE_LIMIT]
    ),
    db.query(
      `SELECT h.id, h.order_id, h.changed_at, COALESCE(o.order_number, '#' || o.id) AS order_number, o.order_type, o.total_amount
       FROM order_status_history h
       JOIN orders o ON o.id = h.order_id
       WHERE h.status = 'cancelled'
       ORDER BY h.changed_at DESC
       LIMIT $1`,
      [PER_SOURCE_LIMIT]
    ),
  ]);

  const events = [];
  for (const r of created.rows) {
    events.push({
      id: `order-${r.id}`,
      category: 'orders',
      type: 'order_new',
      title: `New ${r.order_type} order ${r.order_number}`,
      body: peso(r.total_amount),
      at: r.created_at,
      link: '/admin/oversight/kitchen',
    });
  }
  for (const r of cancelled.rows) {
    events.push({
      id: `order-cancelled-${r.id}`,
      category: 'orders',
      type: 'order_cancelled',
      title: `Order ${r.order_number} cancelled`,
      body: `${r.order_type} order · ${peso(r.total_amount)}`,
      at: r.changed_at,
      link: '/admin/sales',
    });
  }
  return events;
}

async function paymentEvents() {
  const { rows } = await db.query(
    `SELECT p.id, COALESCE(o.order_number, '#' || o.id) AS order_number, p.method, p.amount,
            p.receipt_uploaded_at, p.verified_at, p.rejected_at, p.rejection_reason
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.receipt_uploaded_at IS NOT NULL
        OR p.verified_at IS NOT NULL
        OR p.rejected_at IS NOT NULL
     ORDER BY GREATEST(p.rejected_at, p.verified_at, p.receipt_uploaded_at) DESC
     LIMIT $1`,
    [PER_SOURCE_LIMIT]
  );

  // One line per payment, describing its latest state.
  return rows.map((r) => {
    const label = METHOD_LABELS[r.method] || r.method;
    if (r.rejected_at) {
      return {
        id: `payment-${r.id}-rejected`,
        category: 'payments',
        type: 'payment_rejected',
        title: `${label} payment rejected for ${r.order_number}`,
        body: r.rejection_reason ? `${r.rejection_reason} · ${peso(r.amount)}` : peso(r.amount),
        at: r.rejected_at,
        link: '/admin/sales',
      };
    }
    if (r.verified_at) {
      return {
        id: `payment-${r.id}-verified`,
        category: 'payments',
        type: 'payment_verified',
        title: `${label} payment verified for ${r.order_number}`,
        body: peso(r.amount),
        at: r.verified_at,
        link: '/admin/sales',
      };
    }
    return {
      id: `payment-${r.id}-receipt`,
      category: 'payments',
      type: 'payment_receipt',
      title: `${label} receipt uploaded for ${r.order_number}`,
      body: `Review needed · ${peso(r.amount)}`,
      at: r.receipt_uploaded_at,
      link: '/admin/sales',
    };
  });
}

async function deliveryEvents() {
  const { rows } = await db.query(
    `SELECT d.id, COALESCE(o.order_number, '#' || o.id) AS order_number, d.rider_name, d.assigned_at, d.delivered_at
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE d.delivered_at IS NOT NULL OR d.assigned_at IS NOT NULL
     ORDER BY GREATEST(d.delivered_at, d.assigned_at) DESC
     LIMIT $1`,
    [PER_SOURCE_LIMIT]
  );

  // One line per delivery, describing its latest state.
  return rows.map((r) =>
    r.delivered_at
      ? {
          id: `delivery-${r.id}-delivered`,
          category: 'deliveries',
          type: 'delivery_delivered',
          title: `Order ${r.order_number} delivered`,
          body: r.rider_name ? `Handled by ${r.rider_name}` : null,
          at: r.delivered_at,
          link: '/admin/riders',
        }
      : {
          id: `delivery-${r.id}-assigned`,
          category: 'deliveries',
          type: 'delivery_assigned',
          title: `Rider assigned to ${r.order_number}`,
          body: r.rider_name || null,
          at: r.assigned_at,
          link: '/admin/riders',
        }
  );
}

async function kitchenEvents() {
  const { rows } = await db.query(
    `SELECT a.id, a.triggered_at, a.acknowledged_at, COALESCE(o.order_number, '#' || o.id) AS order_number
     FROM kitchen_alerts a
     JOIN orders o ON o.id = a.order_id
     ORDER BY a.triggered_at DESC
     LIMIT $1`,
    [PER_SOURCE_LIMIT]
  );

  return rows.map((r) => ({
    id: `kitchen-${r.id}`,
    category: 'kitchen',
    type: 'kitchen_alert',
    title: `Kitchen buzzer triggered for ${r.order_number}`,
    body: r.acknowledged_at ? 'Acknowledged' : 'Not yet acknowledged',
    at: r.triggered_at,
    link: '/admin/oversight/kitchen',
  }));
}

async function inventoryEvents() {
  const [low, txns] = await Promise.all([
    db.query(
      `SELECT id, name, unit, current_stock, reorder_level, updated_at
       FROM inventory_items
       WHERE current_stock <= 0
          OR (reorder_level > 0 AND current_stock <= reorder_level)
       ORDER BY updated_at DESC
       LIMIT $1`,
      [PER_SOURCE_LIMIT]
    ),
    // Per-order deductions are skipped on purpose: they would flood the feed
    // with one line per ingredient per order. Only human actions show up.
    db.query(
      `SELECT t.id, t.change_type, t.quantity, t.created_at, i.name, i.unit
       FROM inventory_transactions t
       JOIN inventory_items i ON i.id = t.inventory_item_id
       WHERE t.change_type IN ('restock', 'adjustment')
       ORDER BY t.created_at DESC
       LIMIT $1`,
      [PER_SOURCE_LIMIT]
    ),
  ]);

  const events = [];
  for (const r of low.rows) {
    const out = Number(r.current_stock) <= 0;
    events.push({
      id: `inventory-low-${r.id}`,
      category: 'inventory',
      type: out ? 'inventory_out_of_stock' : 'inventory_low_stock',
      title: `${out ? 'Out of stock' : 'Low stock'}: ${r.name}`,
      body: `${Number(r.current_stock)} ${r.unit} left · reorder at ${Number(r.reorder_level)}`,
      at: r.updated_at,
      link: '/admin/inventory',
    });
  }
  for (const r of txns.rows) {
    const qty = Number(r.quantity);
    events.push({
      id: `inventory-txn-${r.id}`,
      category: 'inventory',
      type: `inventory_${r.change_type}`,
      title: r.change_type === 'restock' ? `Restocked ${r.name}` : `Stock adjusted: ${r.name}`,
      body: `${qty > 0 ? '+' : ''}${qty} ${r.unit}`,
      at: r.created_at,
      link: '/admin/inventory',
    });
  }
  return events;
}

async function customerEvents() {
  const [violations, restrictions] = await Promise.all([
    db.query(
      `SELECT v.id, v.violation_type, v.created_at, COALESCE(o.order_number, '#' || o.id) AS order_number,
              NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') AS customer_name
       FROM customer_order_violations v
       JOIN orders o ON o.id = v.order_id
       LEFT JOIN customers c ON c.id = v.customer_id
       ORDER BY v.created_at DESC
       LIMIT $1`,
      [PER_SOURCE_LIMIT]
    ),
    db.query(
      `SELECT r.customer_id, r.restriction_level, r.reason, r.updated_at,
              NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), '') AS customer_name
       FROM customer_restrictions r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.restriction_level <> 'none'
       ORDER BY r.updated_at DESC
       LIMIT $1`,
      [PER_SOURCE_LIMIT]
    ),
  ]);

  const events = [];
  for (const r of violations.rows) {
    events.push({
      id: `violation-${r.id}`,
      category: 'customers',
      type: 'customer_violation',
      title: `Order ${r.order_number} flagged`,
      body: [VIOLATION_LABELS[r.violation_type] || r.violation_type, r.customer_name]
        .filter(Boolean)
        .join(' · '),
      at: r.created_at,
      link: '/admin/restrictions',
    });
  }
  for (const r of restrictions.rows) {
    events.push({
      id: `restriction-${r.customer_id}`,
      category: 'customers',
      type: 'customer_restriction',
      title: `Restriction updated: ${r.customer_name || `Customer #${r.customer_id}`}`,
      body: [String(r.restriction_level).replace(/_/g, ' '), r.reason].filter(Boolean).join(' · '),
      at: r.updated_at,
      link: '/admin/restrictions',
    });
  }
  return events;
}

async function auditEvents() {
  const { rows } = await db.query(
    `SELECT al.id, al.action, al.created_at, sa.full_name AS actor_name
     FROM audit_log al
     LEFT JOIN staff_accounts sa ON sa.id = al.actor_id
     ORDER BY al.created_at DESC
     LIMIT $1`,
    [PER_SOURCE_LIMIT]
  );

  return rows.map((r) => ({
    id: `audit-${r.id}`,
    category: 'system',
    type: 'audit',
    title: humanizeAction(r.action),
    body: r.actor_name ? `by ${r.actor_name}` : 'System',
    at: r.created_at,
    link: '/admin/audit',
  }));
}

const FETCHERS = {
  orders: orderEvents,
  payments: paymentEvents,
  deliveries: deliveryEvents,
  inventory: inventoryEvents,
  kitchen: kitchenEvents,
  customers: customerEvents,
  system: auditEvents,
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/notifications
 * Query params: limit (default 25, max 50), categories (optional CSV — a
 * subset of the categories enabled in System Settings).
 *
 * Returns { data, unread, lastSeenAt }. `unread` counts events newer than
 * staff_accounts.notification_seen_at, capped at 99.
 */
exports.getNotifications = async (req, res) => {
  try {
    const adminId = req.user.sub;

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    limit = Math.min(limit, MAX_LIMIT);

    const [settings, seenResult] = await Promise.all([
      readNotificationSettings(),
      db.query('SELECT notification_seen_at FROM staff_accounts WHERE id = $1', [adminId]),
    ]);
    const lastSeenAt = seenResult.rows[0]?.notification_seen_at ?? null;

    const requested = String(req.query.categories || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const enabled = NOTIFICATION_CATEGORIES.filter(
      (c) => settings.categories[c] && (requested.length === 0 || requested.includes(c))
    );

    // One source failing (say, an empty table) must not blank the whole feed.
    const results = await Promise.all(
      enabled.map((c) =>
        FETCHERS[c]().catch((err) => {
          console.error(`[getNotifications:${c}]`, err);
          return [];
        })
      )
    );

    const merged = results.flat().sort((a, b) => new Date(b.at) - new Date(a.at));
    const unread = Math.min(
      merged.filter((e) => !lastSeenAt || new Date(e.at) > new Date(lastSeenAt)).length,
      MAX_UNREAD
    );

    return res.json({ data: merged.slice(0, limit), unread, lastSeenAt });
  } catch (err) {
    console.error('[getNotifications]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * POST /api/admin/notifications/seen
 * Marks the whole feed as read for the calling admin.
 */
exports.markSeen = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE staff_accounts
       SET notification_seen_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING notification_seen_at`,
      [req.user.sub]
    );
    return res.json({ data: { lastSeenAt: rows[0]?.notification_seen_at ?? null } });
  } catch (err) {
    console.error('[markSeen]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};
