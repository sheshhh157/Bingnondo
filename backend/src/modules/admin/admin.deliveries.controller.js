const db = require('../../config/db');

const STATUSES = ['pending_assignment', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'];

// Builds the shared WHERE clause. `includeStatus` toggles the status filter so
// the same search predicate can drive both the list and the per-status counts.
function buildWhere({ status, search, includeStatus }) {
  const conditions = [];
  const params = [];

  if (includeStatus && status && status !== 'all' && STATUSES.includes(status)) {
    params.push(status);
    conditions.push(`d.status = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    const i = params.length;
    conditions.push(
      `(o.order_number ILIKE $${i} OR COALESCE(d.rider_name, r.full_name) ILIKE $${i}
        OR r.mobile_number::text ILIKE $${i} OR c.first_name ILIKE $${i}
        OR c.last_name ILIKE $${i} OR c.email ILIKE $${i})`
    );
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

// ─── GET /api/admin/deliveries ────────────────────────────────────────────────
// Read-only delivery list for the admin/manager "Riders & Deliveries" view.
// Joins the real deliveries + orders + riders + customers tables.
// Query: ?status=&search=&page=&limit=
exports.listDeliveries = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitVal = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * limitVal;

    // 1. Per-status counts (search applies, status filter does not)
    const countFilter = buildWhere({ search, includeStatus: false });
    const { rows: countRows } = await db.query(
      `SELECT d.status, COUNT(*)::int AS count
       FROM deliveries d
       JOIN orders o        ON o.id = d.order_id
       LEFT JOIN riders r   ON r.id = d.rider_id
       LEFT JOIN customers c ON c.id = o.customer_id
       ${countFilter.where}
       GROUP BY d.status`,
      countFilter.params
    );

    const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    for (const row of countRows) {
      counts[row.status] = row.count;
    }

    // 2. Total matching the active status + search filters (drives pagination)
    const listFilter = buildWhere({ status, search, includeStatus: true });
    const { rows: totalRows } = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM deliveries d
       JOIN orders o         ON o.id = d.order_id
       LEFT JOIN riders r    ON r.id = d.rider_id
       LEFT JOIN customers c ON c.id = o.customer_id
       ${listFilter.where}`,
      listFilter.params
    );
    const total = totalRows[0].count;

    const listParams = [...listFilter.params, limitVal, offset];

    const { rows } = await db.query(
      `SELECT
         d.id,
         d.order_id,
         d.status,
         d.delivery_preference,
         d.rider_id,
         COALESCE(d.rider_name, r.full_name)        AS rider_name,
         COALESCE(d.rider_contact, r.mobile_number) AS rider_contact,
         r.vehicle_type                             AS rider_vehicle_type,
         r.plate_number                             AS rider_plate_number,
         d.assigned_at,
         d.delivered_at,
         o.order_number,
         o.status          AS order_status,
         o.total_amount,
         o.created_at,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), c.email) AS customer_name,
         c.mobile_number   AS customer_contact,
         COALESCE(o.delivery_address, c.address) AS customer_address,
         COALESCE(items.items, '[]'::json) AS order_items
       FROM deliveries d
       JOIN orders o         ON o.id = d.order_id
       LEFT JOIN riders r    ON r.id = d.rider_id
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object(
                    'id',           oi.id,
                    'name',         mi.name,
                    'variant_name', oi.variant_name,
                    'quantity',     oi.quantity,
                    'unit_price',   oi.unit_price,
                    'notes',        oi.notes
                  ) ORDER BY oi.id
                ) AS items
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = o.id
       ) items ON TRUE
       ${listFilter.where}
       ORDER BY
         CASE d.status
           WHEN 'out_for_delivery'   THEN 0
           WHEN 'assigned'           THEN 1
           WHEN 'pending_assignment' THEN 2
           WHEN 'delivered'          THEN 3
           ELSE 4
         END,
         o.created_at DESC
       LIMIT $${listFilter.params.length + 1} OFFSET $${listFilter.params.length + 2}`,
      listParams
    );

    res.json({ data: rows, total, page: pageNum, limit: limitVal, counts });
  } catch (err) {
    console.error('[admin.deliveries] listDeliveries:', err);
    res.status(500).json({ message: 'Failed to fetch deliveries.' });
  }
};
