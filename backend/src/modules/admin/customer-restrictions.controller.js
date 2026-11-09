const bcrypt = require('bcrypt');
const db = require('../../config/db');

// ─── helpers ──────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalize a PH mobile number to the 11 characters the column allows. */
function normalizeMobile(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `0${digits}`;
  if (digits.length === 12 && digits.startsWith('63')) return `0${digits.slice(2)}`;
  if (digits.length === 11) return digits;
  return digits.slice(-11);
}

async function writeAuditLog(client, actorId, action, targetType, targetId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)]
  );
}

const VALID_LEVELS = ['none', 'warned', 'cod_restricted', 'suspended'];
const VALID_ACCOUNT_STATUSES = ['active', 'suspended'];

// ─────────────────────────────────────────────────────────────────────────────
// 6.4  CUSTOMER RESTRICTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/customer-restrictions
 *
 * Returns registered customer accounts with their violation counts and
 * restriction levels. By default every customer is listed; pass
 * flagged=1 to surface only customers with at least one violation or a
 * non-default restriction row.
 *
 * Query params:
 *   page              number  default 1
 *   limit             number  default 12
 *   search            string  filters on first_name, last_name, email, mobile
 *   restriction_level string  filter by exact level
 *   account_status    string  filter by customers.status
 *   flagged           '1'     only customers with violations/restrictions
 */
exports.listCustomerRestrictions = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const level  = (req.query.restriction_level || '').trim();
    const accountStatus = (req.query.account_status || '').trim();
    const flaggedOnly   = req.query.flagged === '1' || req.query.flagged === 'true';

    const conditions = [];
    const params     = [];

    // flagged=1 keeps the original "interesting customers only" view; without
    // it every customer account is listed.
    if (flaggedOnly) {
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM customer_order_violations v WHERE v.customer_id = c.id
        )
        OR cr.restriction_level IS NOT NULL
      )`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(
        c.first_name ILIKE $${idx}
        OR c.last_name  ILIKE $${idx}
        OR c.email      ILIKE $${idx}
        OR c.mobile_number ILIKE $${idx}
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

    if (accountStatus && VALID_ACCOUNT_STATUSES.includes(accountStatus)) {
      params.push(accountStatus);
      conditions.push(`c.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count + global summary (independent of paging and filters) in one round trip.
    const [{ rows: countRows }, { rows: summaryRows }] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS total
           FROM customers c
           LEFT JOIN customer_restrictions cr ON cr.customer_id = c.id
         ${where}`,
        params
      ),
      db.query(
        `SELECT
            COUNT(*)::int                                                                          AS total_customers,
            (COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM customer_order_violations v WHERE v.customer_id = c.id
             ) OR cr.restriction_level IS NOT NULL))::int                                          AS flagged,
            (COUNT(*) FILTER (WHERE cr.restriction_level = 'warned'))::int                         AS warned,
            (COUNT(*) FILTER (WHERE cr.restriction_level = 'cod_restricted'))::int                 AS cod_restricted,
            (COUNT(*) FILTER (WHERE cr.restriction_level = 'suspended'))::int                      AS restriction_suspended,
            (COUNT(*) FILTER (WHERE c.status = 'suspended'))::int                                  AS accounts_suspended
           FROM customers c
           LEFT JOIN customer_restrictions cr ON cr.customer_id = c.id`
      ),
    ]);
    const total      = parseInt(countRows[0].total, 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const summary    = summaryRows[0];

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
          c.status                                           AS account_status,
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
      summary,
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

    res.json({ data: rows });
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
  const client = await db.getClient();
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

/**
 * PATCH /api/admin/customer-restrictions/:customer_id/account-status
 *
 * Suspend or reinstate a customer's login account (customers.status).
 * Body: { status: 'active'|'suspended', reason }
 *
 * Logs action to audit_log. Setting 'awaiting_verification' manually is
 * not allowed — that state belongs to the signup flow.
 */
exports.updateCustomerAccountStatus = async (req, res) => {
  const client = await db.getClient();
  try {
    const customerId = parseInt(req.params.customer_id, 10);
    if (!customerId) return res.status(400).json({ message: 'Invalid customer ID.' });

    const { status, reason } = req.body;

    if (!status || !VALID_ACCOUNT_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${VALID_ACCOUNT_STATUSES.join(', ')}.`,
      });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A reason is required for audit purposes.' });
    }

    const { rows: check } = await client.query(
      `SELECT id, email, status, CONCAT(first_name, ' ', last_name) AS full_name FROM customers WHERE id = $1`,
      [customerId]
    );
    if (!check.length) return res.status(404).json({ message: 'Customer not found.' });
    const customer = check[0];

    if (customer.status === status) {
      return res.status(409).json({ message: `This account is already ${status === 'suspended' ? 'suspended' : 'active'}.` });
    }

    await client.query('BEGIN');

    const { rows: updated } = await client.query(
      `UPDATE customers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status, updated_at`,
      [status, customerId]
    );

    await writeAuditLog(
      client,
      req.user.sub,
      'customer_account_status_change',
      'customer',
      customerId,
      {
        customer_email: customer.email,
        customer_name:  customer.full_name,
        from_status:    customer.status,
        to_status:      status,
        reason:         reason.trim(),
      }
    );

    await client.query('COMMIT');

    res.json({
      message:  status === 'suspended' ? 'Account suspended.' : 'Account reinstated.',
      customer: updated[0],
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[customer-restrictions] updateCustomerAccountStatus:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/admin/customer-restrictions
 *
 * Admin creates a mobile-app (customer) account on a user's behalf. The
 * account is created already verified and active so the user can sign in to
 * the app immediately with the temporary password.
 *
 * Body: { first_name, last_name, email, mobile_number, password, address? }
 */
exports.createCustomerAccount = async (req, res) => {
  const client = await db.getClient();
  try {
    const body = req.body || {};
    const firstName = String(body.first_name || '').trim();
    const lastName  = String(body.last_name  || '').trim();
    const email     = String(body.email || '').toLowerCase().trim();
    const mobile    = normalizeMobile(body.mobile_number);
    const password  = typeof body.password === 'string' ? body.password : '';
    const address   = String(body.address || '').trim() || null;

    if (!firstName) return res.status(400).json({ message: 'First name is required.' });
    if (!lastName)  return res.status(400).json({ message: 'Last name is required.' });
    if (firstName.length > 50) return res.status(400).json({ message: 'First name must be 50 characters or fewer.' });
    if (lastName.length > 50)  return res.status(400).json({ message: 'Last name must be 50 characters or fewer.' });

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!/^(09\d{9}|639\d{9})$/.test(mobile)) {
      return res.status(400).json({ message: 'Enter a valid mobile number (e.g. 09XX XXX XXXX).' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }
    if (password.length > 128) {
      return res.status(400).json({ message: 'Password must be 128 characters or fewer.' });
    }

    // Uniqueness is enforced by DB constraints too, but checking first gives a
    // clear field-specific message instead of a generic conflict.
    const { rows: existing } = await client.query(
      `SELECT email, mobile_number FROM customers
        WHERE email = $1 OR mobile_number = $2
        LIMIT 1`,
      [email, mobile]
    );
    if (existing.length > 0) {
      if (existing[0].email === email) {
        return res.status(409).json({ message: 'An account with this email already exists.' });
      }
      return res.status(409).json({ message: 'An account with this mobile number already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO customers
            (email, password_hash, email_verified, first_name, last_name,
             mobile_number, mobile_verified, address, profile_completed, status)
       VALUES ($1, $2, TRUE, $3, $4, $5, TRUE, $6, $7, 'active')
       RETURNING id, email, first_name, last_name, mobile_number, status, created_at`,
      [email, passwordHash, firstName, lastName, mobile, address, Boolean(address)]
    );
    const customer = rows[0];

    await writeAuditLog(
      client,
      req.user.sub,
      'customer_account_created',
      'customer',
      customer.id,
      {
        customer_email: customer.email,
        customer_name:  `${firstName} ${lastName}`.trim(),
        mobile_number:  customer.mobile_number,
        created_by:     req.user.sub,
      }
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'User account created.',
      customer,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err?.code === '23505') {
      return res.status(409).json({ message: 'An account with this email or mobile number already exists.' });
    }
    console.error('[customer-restrictions] createCustomerAccount:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};