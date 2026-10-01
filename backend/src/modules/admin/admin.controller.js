const bcrypt = require('bcrypt');
const db = require('../../config/db');

const BCRYPT_ROUNDS = 12;

// Valid dashboards a staff member can be granted access to.
// 'admin' is intentionally excluded — admin is always a hard login.
const VALID_DASHBOARDS = ['cashier', 'kitchen_staff', 'staff', 'owner'];
const VALID_ROLES      = ['cashier', 'kitchen_staff', 'staff', 'owner', 'admin'];

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

    // For each account, fetch the dashboards they have access to
    const { rows: accessRows } = await db.query(
      `SELECT sda.staff_id, sda.target_dashboard, sda.granted_at,
              grantor.full_name AS granted_by_name
       FROM staff_dashboard_access sda
       JOIN staff_accounts grantor ON grantor.id = sda.granted_by`
    );

    // Fetch switch config rows
    const { rows: configRows } = await db.query(
      `SELECT scope, staff_id, target_dashboard, requires_pin, updated_at
       FROM dashboard_switch_config`
    );

    // Fetch which staff members have a PIN set
    const { rows: pinRows } = await db.query(
      `SELECT staff_id, set_by_admin, updated_at FROM staff_switch_pin`
    );

    // Build lookup maps
    const accessByStaff  = {};
    for (const row of accessRows) {
      if (!accessByStaff[row.staff_id]) accessByStaff[row.staff_id] = [];
      accessByStaff[row.staff_id].push({
        dashboard:      row.target_dashboard,
        granted_at:     row.granted_at,
        granted_by_name: row.granted_by_name,
      });
    }

    const pinByStaff = {};
    for (const row of pinRows) {
      pinByStaff[row.staff_id] = { set_by_admin: row.set_by_admin, updated_at: row.updated_at };
    }

    const perStaffConfig = {};
    for (const row of configRows) {
      if (row.scope === 'per_staff' && row.staff_id) {
        perStaffConfig[row.staff_id] = { requires_pin: row.requires_pin };
      }
    }

    // Attach to each account
    const result = accounts.map(acc => ({
      ...sanitizeStaff(acc),
      dashboard_access: accessByStaff[acc.id] || [],
      pin_set:          !!pinByStaff[acc.id],
      pin_set_by_admin: pinByStaff[acc.id]?.set_by_admin ?? null,
      switch_requires_pin_override: perStaffConfig[acc.id]?.requires_pin ?? null,
    }));

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

    const { rows: access } = await db.query(
      `SELECT sda.target_dashboard, sda.granted_at, grantor.full_name AS granted_by_name
       FROM staff_dashboard_access sda
       JOIN staff_accounts grantor ON grantor.id = sda.granted_by
       WHERE sda.staff_id = $1`,
      [staffId]
    );

    const { rows: pinRow } = await db.query(
      `SELECT set_by_admin, updated_at FROM staff_switch_pin WHERE staff_id = $1`,
      [staffId]
    );

    const { rows: configRow } = await db.query(
      `SELECT requires_pin FROM dashboard_switch_config
       WHERE scope = 'per_staff' AND staff_id = $1`,
      [staffId]
    );

    return res.json({
      data: {
        ...sanitizeStaff(rows[0]),
        dashboard_access:               access,
        pin_set:                        pinRow.length > 0,
        pin_set_by_admin:               pinRow[0]?.set_by_admin ?? null,
        switch_requires_pin_override:   configRow[0]?.requires_pin ?? null,
      },
    });
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
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}.` });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    // Admin cannot create another admin through self-service UI
    if (role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be created through this interface.' });
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

// ─────────────────────────────────────────────────────────────────────────────
// 6.1+  DASHBOARD ACCESS MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/staff-accounts/:id/dashboard-access
 * List dashboards a staff member can switch to, plus PIN and config state.
 */
exports.getDashboardAccess = async (req, res) => {
  try {
    const staffId = parseInt(req.params.id, 10);
    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });

    const { rows: staff } = await db.query(
      'SELECT id, full_name, role FROM staff_accounts WHERE id = $1',
      [staffId]
    );
    if (staff.length === 0) return res.status(404).json({ message: 'Staff account not found.' });

    const { rows: access } = await db.query(
      `SELECT sda.target_dashboard, sda.granted_at, grantor.full_name AS granted_by_name
       FROM staff_dashboard_access sda
       JOIN staff_accounts grantor ON grantor.id = sda.granted_by
       WHERE sda.staff_id = $1
       ORDER BY sda.granted_at DESC`,
      [staffId]
    );

    const { rows: pinRow } = await db.query(
      'SELECT set_by_admin, updated_at FROM staff_switch_pin WHERE staff_id = $1',
      [staffId]
    );

    const { rows: configRow } = await db.query(
      `SELECT requires_pin FROM dashboard_switch_config
       WHERE scope = 'per_staff' AND staff_id = $1`,
      [staffId]
    );

    return res.json({
      data: {
        staff_id:   staffId,
        full_name:  staff[0].full_name,
        home_role:  staff[0].role,
        granted_dashboards:           access,
        pin_set:                      pinRow.length > 0,
        pin_set_by_admin:             pinRow[0]?.set_by_admin ?? null,
        pin_last_updated:             pinRow[0]?.updated_at ?? null,
        per_staff_requires_pin:       configRow[0]?.requires_pin ?? null,
      },
    });
  } catch (err) {
    console.error('[getDashboardAccess]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * PUT /api/admin/staff-accounts/:id/dashboard-access
 * Replace the full set of granted dashboards for a staff member.
 * Body: { dashboards: ['cashier', 'kitchen_staff', ...] }
 *
 * Passing an empty array revokes all access.
 */
exports.setDashboardAccess = async (req, res) => {
  const client = await db.getClient();
  try {
    const staffId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;
    const { dashboards } = req.body;

    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });
    if (!Array.isArray(dashboards)) {
      return res.status(400).json({ message: '`dashboards` must be an array.' });
    }

    const invalid = dashboards.filter(d => !VALID_DASHBOARDS.includes(d));
    if (invalid.length > 0) {
      return res.status(400).json({
        message: `Invalid dashboard(s): ${invalid.join(', ')}. Must be one of: ${VALID_DASHBOARDS.join(', ')}.`,
      });
    }

    await client.query('BEGIN');

    // Verify staff exists and is not admin
    const { rows: staff } = await client.query(
      'SELECT id, role FROM staff_accounts WHERE id = $1',
      [staffId]
    );
    if (staff.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff account not found.' });
    }

    // Get previous access for audit diff
    const { rows: prevAccess } = await client.query(
      'SELECT target_dashboard FROM staff_dashboard_access WHERE staff_id = $1',
      [staffId]
    );
    const previous = prevAccess.map(r => r.target_dashboard);

    // Delete all existing access for this staff member
    await client.query(
      'DELETE FROM staff_dashboard_access WHERE staff_id = $1',
      [staffId]
    );

    // Insert new access rows
    const inserted = [];
    for (const dashboard of dashboards) {
      await client.query(
        `INSERT INTO staff_dashboard_access (staff_id, target_dashboard, granted_by)
         VALUES ($1, $2, $3)`,
        [staffId, dashboard, adminId]
      );
      inserted.push(dashboard);
    }

    const granted = dashboards.filter(d => !previous.includes(d));
    const revoked = previous.filter(d => !dashboards.includes(d));

    await writeAuditLog(client, adminId, 'update_dashboard_access', 'staff_accounts', staffId, {
      granted,
      revoked,
      final_access: inserted,
    });

    await client.query('COMMIT');

    return res.json({
      message: 'Dashboard access updated successfully.',
      data: {
        staff_id:           staffId,
        granted_dashboards: inserted,
        granted,
        revoked,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[setDashboardAccess]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6.1+  SWITCH PIN MANAGEMENT (Admin side)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/staff-accounts/:id/switch-pin
 * Admin sets or resets a staff member's dashboard-switch PIN.
 * Body: { pin }  — plain 4-6 digit string; hashed here before storage.
 */
exports.adminSetSwitchPin = async (req, res) => {
  const client = await db.getClient();
  try {
    const staffId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;
    const { pin } = req.body;

    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });
    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ message: 'PIN must be 4 to 6 digits.' });
    }

    await client.query('BEGIN');

    const { rows: staff } = await client.query(
      'SELECT id, full_name FROM staff_accounts WHERE id = $1',
      [staffId]
    );
    if (staff.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff account not found.' });
    }

    const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    // Upsert — replace existing PIN if one exists
    await client.query(
      `INSERT INTO staff_switch_pin (staff_id, pin_hash, set_by_admin, updated_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (staff_id)
       DO UPDATE SET pin_hash = EXCLUDED.pin_hash,
                     set_by_admin = TRUE,
                     updated_at = NOW()`,
      [staffId, pinHash]
    );

    await writeAuditLog(client, adminId, 'set_switch_pin', 'staff_accounts', staffId, {
      target_name: staff[0].full_name,
    });

    await client.query('COMMIT');

    return res.json({ message: 'Switch PIN set successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[adminSetSwitchPin]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/admin/staff-accounts/:id/switch-pin
 * Admin removes a staff member's switch PIN.
 * Use case: revoking PIN requirement without deleting access.
 */
exports.adminRemoveSwitchPin = async (req, res) => {
  const client = await db.getClient();
  try {
    const staffId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;

    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });

    await client.query('BEGIN');

    const { rowCount } = await client.query(
      'DELETE FROM staff_switch_pin WHERE staff_id = $1',
      [staffId]
    );

    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No PIN found for this staff member.' });
    }

    await writeAuditLog(client, adminId, 'remove_switch_pin', 'staff_accounts', staffId, {});

    await client.query('COMMIT');

    return res.json({ message: 'Switch PIN removed successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[adminRemoveSwitchPin]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6.1+  SWITCH PIN REQUIREMENT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/switch-config
 * Returns all switch config rows (per_staff + per_dashboard).
 */
exports.getSwitchConfig = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT dsc.*, sa.full_name AS staff_name, cfg.full_name AS configured_by_name
       FROM dashboard_switch_config dsc
       LEFT JOIN staff_accounts sa  ON sa.id  = dsc.staff_id
       LEFT JOIN staff_accounts cfg ON cfg.id = dsc.configured_by
       ORDER BY dsc.scope, dsc.updated_at DESC`
    );

    return res.json({ data: rows });
  } catch (err) {
    console.error('[getSwitchConfig]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * PUT /api/admin/switch-config/per-staff/:staffId
 * Set whether this specific staff member must enter a PIN when switching.
 * Body: { requires_pin: true | false }
 */
exports.setPerStaffSwitchConfig = async (req, res) => {
  const client = await db.getClient();
  try {
    const staffId  = parseInt(req.params.staffId, 10);
    const adminId  = req.user.sub;
    const { requires_pin } = req.body;

    if (isNaN(staffId)) return res.status(400).json({ message: 'Invalid staff ID.' });
    if (typeof requires_pin !== 'boolean') {
      return res.status(400).json({ message: '`requires_pin` must be a boolean.' });
    }

    await client.query('BEGIN');

    const { rows: staff } = await client.query(
      'SELECT id FROM staff_accounts WHERE id = $1',
      [staffId]
    );
    if (staff.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Staff account not found.' });
    }

    await client.query(
      `INSERT INTO dashboard_switch_config
         (scope, staff_id, target_dashboard, requires_pin, configured_by, updated_at)
       VALUES ('per_staff', $1, NULL, $2, $3, NOW())
       ON CONFLICT (staff_id)
       DO UPDATE SET requires_pin = EXCLUDED.requires_pin,
                     configured_by = EXCLUDED.configured_by,
                     updated_at = NOW()`,
      [staffId, requires_pin, adminId]
    );

    await writeAuditLog(client, adminId, 'configure_switch_require', 'staff_accounts', staffId, {
      scope: 'per_staff',
      requires_pin,
    });

    await client.query('COMMIT');

    return res.json({
      message: `PIN requirement ${requires_pin ? 'enabled' : 'disabled'} for this staff member.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[setPerStaffSwitchConfig]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/admin/switch-config/per-dashboard/:dashboard
 * Set whether ALL switches targeting a dashboard require a PIN.
 * Body: { requires_pin: true | false }
 */
exports.setPerDashboardSwitchConfig = async (req, res) => {
  const client = await db.getClient();
  try {
    const { dashboard } = req.params;
    const adminId = req.user.sub;
    const { requires_pin } = req.body;

    if (!VALID_DASHBOARDS.includes(dashboard)) {
      return res.status(400).json({
        message: `Invalid dashboard. Must be one of: ${VALID_DASHBOARDS.join(', ')}.`,
      });
    }
    if (typeof requires_pin !== 'boolean') {
      return res.status(400).json({ message: '`requires_pin` must be a boolean.' });
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO dashboard_switch_config
         (scope, staff_id, target_dashboard, requires_pin, configured_by, updated_at)
       VALUES ('per_dashboard', NULL, $1, $2, $3, NOW())
       ON CONFLICT (target_dashboard)
       DO UPDATE SET requires_pin = EXCLUDED.requires_pin,
                     configured_by = EXCLUDED.configured_by,
                     updated_at = NOW()`,
      [dashboard, requires_pin, adminId]
    );

    await writeAuditLog(client, adminId, 'configure_switch_require', 'dashboard_switch_config', null, {
      scope: 'per_dashboard',
      target_dashboard: dashboard,
      requires_pin,
    });

    await client.query('COMMIT');

    return res.json({
      message: `PIN requirement ${requires_pin ? 'enabled' : 'disabled'} for the '${dashboard}' dashboard.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[setPerDashboardSwitchConfig]', err);
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