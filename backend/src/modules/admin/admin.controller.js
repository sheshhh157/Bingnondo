const bcrypt = require('bcrypt');
const db = require('../../config/db');

const BCRYPT_ROUNDS = 12;

const VALID_ROLES = ['cashier', 'kitchen_staff'];

// ─── helpers ──────────────────────────────────────────────────────────────────

function sanitizeStaff(row) {
  const { password_hash, ...safe } = row;
  return safe;
}

async function writeAuditLog(client, actorId, action, targetType, targetId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6.1  STAFF ACCOUNT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/staff-accounts
 * List all staff accounts with their granted dashboard access.
 * Admin only.
 */
exports.listStaffAccounts = async (req, res) => {
  try {
    // Fetch all accounts (excluding the calling admin from the list is optional;
    // we include everyone so the admin can see the full picture)
    const { rows: accounts } = await db.query(
      `SELECT
         sa.id, sa.full_name, sa.email, sa.role, sa.status,
         sa.created_by, sa.created_at, sa.updated_at,
         creator.full_name AS created_by_name
       FROM staff_accounts sa
       LEFT JOIN staff_accounts creator ON creator.id = sa.created_by
       ORDER BY sa.created_at DESC`
    );

    const result = accounts.map(acc => sanitizeStaff(acc));

    return res.json({ data: result });
  } catch (err) {
    console.error('[listStaffAccounts]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * GET /api/admin/staff-accounts/:id
 * Single staff account detail.
 */
exports.getStaffAccount = async (req, res) => {
  try {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });

    const { rows } = await db.query(
      `SELECT sa.*, creator.full_name AS created_by_name
       FROM staff_accounts sa
       LEFT JOIN staff_accounts creator ON creator.id = sa.created_by
       WHERE sa.id = $1`,
      [staffId]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Staff account not found.' });

    return res.json({ data: sanitizeStaff(rows[0]) });
  } catch (err) {
    console.error('[getStaffAccount]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * POST /api/admin/staff-accounts
 * Create a new staff account.
 * Body: { full_name, email, password, role }
 */
exports.createStaffAccount = async (req, res) => {
  const client = await db.getClient();
  try {
    const { full_name, email, password, role } = req.body;
    const adminId = req.user.sub;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ message: 'full_name, email, password, and role are required.' });
    }
    // Hard block — admin accounts can never be created via this endpoint, no exceptions
    if (role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be created through this interface.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.` });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    await client.query('BEGIN');

    // Check email uniqueness
    const { rows: existing } = await client.query(
      'SELECT id FROM staff_accounts WHERE email = $1',
      [normalizedEmail]
    );
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    // Check full name uniqueness (case- and whitespace-insensitive)
    const { rows: nameTaken } = await client.query(
      `SELECT id FROM staff_accounts
        WHERE lower(regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g'))
            = lower(regexp_replace(btrim($1),        '[[:space:]]+', ' ', 'g'))`,
      [full_name]
    );
    if (nameTaken.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'That name is already in use by another account.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows } = await client.query(
      `INSERT INTO staff_accounts (full_name, email, password_hash, role, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [full_name.trim(), normalizedEmail, passwordHash, role, adminId]
    );
    const newStaff = rows[0];

    await writeAuditLog(client, adminId, 'create_staff_account', 'staff_accounts', newStaff.id, {
      email: normalizedEmail,
      role,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Staff account created successfully.',
      data: sanitizeStaff(newStaff),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createStaffAccount]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/admin/staff-accounts/:id/status
 * Activate or deactivate a staff account.
 * Body: { status: 'active' | 'deactivated' }
 */
exports.updateStaffStatus = async (req, res) => {
  const client = await db.getClient();
  try {
    const staffId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;
    const { status } = req.body;

    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });
    if (!['active', 'deactivated'].includes(status)) {
      return res.status(400).json({ message: "status must be 'active' or 'deactivated'." });
    }
    if (staffId === adminId) {
      return res.status(403).json({ message: 'You cannot change your own account status.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE staff_accounts SET status = $1, updated_at = NOW()
       WHERE id = $2 AND role != 'admin'
       RETURNING *`,
      [status, staffId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff account not found or cannot modify an admin account.' });
    }

    await writeAuditLog(client, adminId, status === 'deactivated' ? 'deactivate_staff_account' : 'activate_staff_account',
      'staff_accounts', staffId, { new_status: status }
    );

    await client.query('COMMIT');

    return res.json({
      message: `Account ${status === 'deactivated' ? 'deactivated' : 'activated'} successfully.`,
      data: sanitizeStaff(rows[0]),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateStaffStatus]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/admin/staff-accounts/:id/reset-password
 * Admin triggers a password reset for a staff member.
 * Body: { new_password }
 * (Direct reset — no OTP needed since admin is already authenticated)
 */
exports.resetStaffPassword = async (req, res) => {
  const client = await db.getClient();
  try {
    const staffId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;
    const { new_password } = req.body;

    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id, email, role FROM staff_accounts WHERE id = $1',
      [staffId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff account not found.' });
    }

    const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await client.query(
      'UPDATE staff_accounts SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, staffId]
    );

    await writeAuditLog(client, adminId, 'reset_staff_password', 'staff_accounts', staffId, {
      target_email: rows[0].email,
    });

    await client.query('COMMIT');

    return res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[resetStaffPassword]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};


/**
 * PUT /api/admin/staff-accounts/:id
 * Update a staff account's name, email and/or role.
 * Body: { full_name?, email?, role? }
 */
exports.updateStaffAccount = async (req, res) => {
  const client = await db.getClient();
  try {
    const staffId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;
    const { full_name, email, role } = req.body;

    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });

    const { rows: currentRows } = await client.query(
      'SELECT id, full_name, email, role FROM staff_accounts WHERE id = $1',
      [staffId]
    );
    const current = currentRows[0];
    if (!current) return res.status(404).json({ message: 'Staff account not found.' });
    // Only cashier / kitchen_staff accounts are managed here (never admin/owner/legacy staff)
    if (!VALID_ROLES.includes(current.role)) {
      return res.status(403).json({ message: 'This account cannot be modified through this interface.' });
    }

    const nextName  = full_name !== undefined ? String(full_name).trim() : null;
    const nextEmail = email    !== undefined ? String(email).toLowerCase().trim() : null;
    const nextRole  = role     !== undefined ? role : null;

    if (nextName !== null && nextName === '') {
      return res.status(400).json({ message: 'Full name cannot be empty.' });
    }
    if (nextEmail !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (nextRole !== null && !VALID_ROLES.includes(nextRole)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.` });
    }
    if (nextRole !== null && nextRole !== current.role && staffId === adminId) {
      return res.status(403).json({ message: 'You cannot change your own role.' });
    }

    await client.query('BEGIN');

    if (nextEmail !== null && nextEmail !== current.email) {
      const { rows: dup } = await client.query(
        'SELECT id FROM staff_accounts WHERE email = $1 AND id <> $2',
        [nextEmail, staffId]
      );
      if (dup.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'An account with this email already exists.' });
      }
    }

    // Full name uniqueness (case- and whitespace-insensitive), ignoring this account.
    if (nextName !== null) {
      const { rows: nameDup } = await client.query(
        `SELECT id FROM staff_accounts
          WHERE id <> $2
            AND lower(regexp_replace(btrim(full_name), '[[:space:]]+', ' ', 'g'))
              = lower(regexp_replace(btrim($1),        '[[:space:]]+', ' ', 'g'))`,
        [nextName, staffId]
      );
      if (nameDup.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'That name is already in use by another account.' });
      }
    }

    const { rows } = await client.query(
      `UPDATE staff_accounts SET
         full_name  = COALESCE($1, full_name),
         email      = COALESCE($2, email),
         role       = COALESCE($3, role),
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [nextName || null, nextEmail || null, nextRole, staffId]
    );
    const updated = rows[0];

    await writeAuditLog(client, adminId, 'update_staff_account', 'staff_accounts', staffId, {
      before: { full_name: current.full_name, email: current.email, role: current.role },
      after:  { full_name: updated.full_name,  email: updated.email,  role: updated.role  },
    });

    await client.query('COMMIT');

    return res.json({
      message: 'Staff account updated successfully.',
      data: sanitizeStaff(updated),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateStaffAccount]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/admin/staff-accounts/:id
 * Permanently remove a staff account. Blocked when the account has activity
 * (audit trail, orders, etc.) — deactivate it instead in that case.
 */
exports.deleteStaffAccount = async (req, res) => {
  const client = await db.getClient();
  try {
    const staffId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;

    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });
    if (staffId === adminId) {
      return res.status(403).json({ message: 'You cannot delete your own account.' });
    }

    const { rows: currentRows } = await client.query(
      'SELECT id, full_name, email, role FROM staff_accounts WHERE id = $1',
      [staffId]
    );
    const current = currentRows[0];
    if (!current) return res.status(404).json({ message: 'Staff account not found.' });
    if (!VALID_ROLES.includes(current.role)) {
      return res.status(403).json({ message: 'This account cannot be deleted through this interface.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `DELETE FROM staff_accounts WHERE id = $1 AND role != 'admin'
       RETURNING id, full_name, email, role`,
      [staffId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff account not found.' });
    }

    await writeAuditLog(client, adminId, 'delete_staff_account', 'staff_accounts', staffId, {
      full_name: current.full_name,
      email: current.email,
      role: current.role,
    });

    await client.query('COMMIT');

    return res.json({ message: 'Staff account deleted successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err && err.code === '23503') {
      return res.status(409).json({ message: "This account has activity and can't be deleted. Deactivate it instead." });
    }
    console.error('[deleteStaffAccount]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// 6.3  AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit-log
 * Query params: actor_id, action, target_type, from, to, page, limit
 */
exports.getAuditLog = async (req, res) => {
  try {
    const {
      actor_id,
      action,
      target_type,
      from: fromDate,
      to: toDate,
      page  = 1,
      limit = 50,
    } = req.query;

    const conditions = [];
    const params = [];
    let p = 1;

    if (actor_id) { conditions.push(`al.actor_id = $${p++}`);    params.push(parseInt(actor_id, 10)); }
    if (action)   { conditions.push(`al.action ILIKE $${p++}`);  params.push(`%${action}%`); }
    if (target_type) { conditions.push(`al.target_type = $${p++}`); params.push(target_type); }
    if (fromDate) { conditions.push(`al.created_at >= $${p++}`); params.push(fromDate); }
    if (toDate)   { conditions.push(`al.created_at <= $${p++}`); params.push(toDate); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10));
    const limitVal = Math.min(100, parseInt(limit, 10));

    params.push(limitVal, offset);

    const { rows } = await db.query(
      `SELECT al.*, sa.full_name AS actor_name
       FROM audit_log al
       LEFT JOIN staff_accounts sa ON sa.id = al.actor_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );

    // Total count for pagination
    const countParams = params.slice(0, -2);
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM audit_log al ${where}`,
      countParams
    );

    return res.json({
      data:  rows,
      total: parseInt(countRows[0].count, 10),
      page:  parseInt(page, 10),
      limit: limitVal,
    });
  } catch (err) {
    console.error('[getAuditLog]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};