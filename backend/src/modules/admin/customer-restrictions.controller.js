const db = require('../../config/db');

// ─── helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog(client, actorId, action, targetType, targetId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)]
  );
}

const VALID_LEVELS = ['none', 'warned', 'cod_restricted', 'suspended'];

// ─────────────────────────────────────────────────────────────────────────────
// 6.4  CUSTOMER RESTRICTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/customer-restrictions
 *
 * Returns all customers who have at least one violation OR an active
 * restriction (restriction_level != 'none').
 *
 * Query params:
 *   page              number  default 1
 *   limit             number  default 12
 *   search            string  filters on first_name, last_name, email
 *   restriction_level string  filter by exact level
 */
exports.listCustomerRestrictions = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const level  = (req.query.restriction_level || '').trim();

    const conditions = [];
    const params     = [];

    // Only surface customers that are "interesting" — have at least one
    // violation or a non-default restriction row.
    conditions.push(`(
      EXISTS (
        SELECT 1 FROM customer_order_violations v WHERE v.customer_id = c.id
      )
      OR cr.restriction_level IS NOT NULL
    )`);

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(
        c.first_name ILIKE $${idx}
        OR c.last_name  ILIKE $${idx}
        OR c.email      ILIKE $${idx}
        OR CONCAT(c.first_name, ' ', c.last_name) ILIKE $${idx}
      )`);
    }

    if (level && VALID_LEVELS.includes(level)) {
      params.push(level);
      if (level === 'none') {
        conditions.push(`(cr.restriction_level = $${params.length} OR cr.restriction_level IS NULL)`);
      } else {
        conditions.push(`cr.restriction_level = $${params.length}`);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) AS total
         FROM customers c
         LEFT JOIN customer_restrictions cr ON cr.customer_id = c.id
       ${where}`,
      params
    );
    const total      = parseInt(countRows[0].total, 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Data query
    params.push(limit, offset);
    const limitIdx  = params.length - 1;
    const offsetIdx = params.length;

    const { rows } = await db.query(
      `SELECT
          c.id                                               AS customer_id,
          CONCAT(c.first_name, ' ', c.last_name)            AS customer_name,
          c.email                                            AS customer_email,
          c.mobile_number                                    AS customer_mobile,
          COALESCE(cr.restriction_level, 'none')            AS restriction_level,
          cr.reason,
          cr.updated_at                                      AS restriction_updated_at,
          updater.full_name                                  AS updated_by_name,
          (
            SELECT COUNT(*)::int
              FROM customer_order_violations v
             WHERE v.customer_id = c.id
          )                                                  AS total_violations,
          (
            SELECT COUNT(*)::int
              FROM customer_order_violations v
             WHERE v.customer_id = c.id
               AND v.created_at >= NOW() - INTERVAL '30 days'
          )                                                  AS violations_last_30d
        FROM customers c
        LEFT JOIN customer_restrictions cr  ON cr.customer_id = c.id
        LEFT JOIN staff_accounts updater    ON updater.id = cr.updated_by
       ${where}
       ORDER BY
          CASE COALESCE(cr.restriction_level, 'none')
            WHEN 'suspended'      THEN 1
            WHEN 'cod_restricted' THEN 2
            WHEN 'warned'         THEN 3
            ELSE 4
          END,
          total_violations DESC,
          customer_name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    res.json({
      data:       rows,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (err) {
    console.error('[customer-restrictions] listCustomerRestrictions:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * GET /api/admin/customer-restrictions/:customer_id/violations
 *
 * Returns the full violation history for a single customer, newest first.
 */
exports.getCustomerViolations = async (req, res) => {
  try {
    const customerId = parseInt(req.params.customer_id, 10);
    if (!customerId) return res.status(400).json({ message: 'Invalid customer ID.' });

    // Confirm customer exists
    const { rows: check } = await db.query(
      `SELECT id FROM customers WHERE id = $1`,
      [customerId]
    );
    if (!check.length) return res.status(404).json({ message: 'Customer not found.' });

    const { rows } = await db.query(
      `SELECT
          v.id,
          v.violation_type,
          v.created_at,
          o.order_number,
          sa.full_name AS flagged_by_name
        FROM customer_order_violations v
        JOIN orders o              ON o.id = v.order_id
        LEFT JOIN staff_accounts sa ON sa.id = v.flagged_by
       WHERE v.customer_id = $1
       ORDER BY v.created_at DESC`,
      [customerId]
    );

    res.json(rows);
  } catch (err) {
    console.error('[customer-restrictions] getCustomerViolations:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * PATCH /api/admin/customer-restrictions/:customer_id
 *
 * Admin/Owner manually overrides a customer's restriction level.
 * Body: { restriction_level, reason }
 *
 * Always sets updated_by = req.user.sub so it's never NULL (admin override).
 * Logs action to audit_log.
 */
exports.overrideCustomerRestriction = async (req, res) => {
  const client = await db.connect();
  try {
    const customerId = parseInt(req.params.customer_id, 10);
    if (!customerId) return res.status(400).json({ message: 'Invalid customer ID.' });

    const { restriction_level, reason } = req.body;

    if (!restriction_level || !VALID_LEVELS.includes(restriction_level)) {
      return res.status(400).json({
        message: `restriction_level must be one of: ${VALID_LEVELS.join(', ')}.`,
      });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason is required for audit purposes.' });
    }

    // Confirm customer exists — customers table uses first_name/last_name
    const { rows: check } = await client.query(
      `SELECT id, email, CONCAT(first_name, ' ', last_name) AS full_name FROM customers WHERE id = $1`,
      [customerId]
    );
    if (!check.length) return res.status(404).json({ message: 'Customer not found.' });
    const customer = check[0];

    await client.query('BEGIN');

    // Fetch previous restriction level for the audit entry
    const { rows: prev } = await client.query(
      `SELECT restriction_level FROM customer_restrictions WHERE customer_id = $1`,
      [customerId]
    );
    const prevLevel = prev[0]?.restriction_level ?? 'none';

    // Upsert customer_restrictions
    const { rows: updated } = await client.query(
      `INSERT INTO customer_restrictions
            (customer_id, restriction_level, reason, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (customer_id)
         DO UPDATE SET
           restriction_level = EXCLUDED.restriction_level,
           reason            = EXCLUDED.reason,
           updated_by        = EXCLUDED.updated_by,
           updated_at        = EXCLUDED.updated_at
       RETURNING *`,
      [customerId, restriction_level, reason.trim(), req.user.sub]
    );

    // Audit log
    await writeAuditLog(
      client,
      req.user.sub,
      'customer_restriction_override',
      'customer',
      customerId,
      {
        customer_email: customer.email,
        customer_name:  customer.full_name,
        from_level:     prevLevel,
        to_level:       restriction_level,
        reason:         reason.trim(),
      }
    );

    await client.query('COMMIT');

    res.json({
      message:     `Restriction updated to '${restriction_level}'.`,
      restriction: updated[0],
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[customer-restrictions] overrideCustomerRestriction:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};