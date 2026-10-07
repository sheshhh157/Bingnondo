const bcrypt = require('bcrypt');
const db = require('../../config/db');

const BCRYPT_ROUNDS = 12;

const VALID_STATUSES  = ['available', 'inactive'];
const VALID_VEHICLES  = ['motorcycle', 'bicycle', 'e_bike', 'car', 'van'];

// ─── helpers ──────────────────────────────────────────────────────────────────

function sanitizeRider(row) {
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
// 6.5  RIDER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/riders
 * List all riders with optional filters.
 * Query params: status, search, page, limit
 * Admin only.
 */
exports.listRiders = async (req, res) => {
  try {
    const {
      status,
      search,
      page  = 1,
      limit = 20,
    } = req.query;

    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (status && status !== 'all') {
      conditions.push(`r.status = $${p++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(
        `(r.full_name ILIKE $${p} OR r.mobile_number ILIKE $${p} OR r.email ILIKE $${p} OR r.plate_number ILIKE $${p})`
      );
      params.push(`%${search.trim()}%`);
      p++;
    }

    const where    = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const pageNum  = Math.max(1, parseInt(page,  10));
    const limitVal = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * limitVal;

    // Count query
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM riders r ${where}`,
      params
    );
    const total = parseInt(countRows[0].count, 10);

    // Data query
    params.push(limitVal, offset);
    const { rows } = await db.query(
      `SELECT
         r.id, r.full_name, r.mobile_number, r.email,
         r.plate_number, r.vehicle_type, r.notes,
         r.status, r.last_login, r.created_by, r.created_at, r.updated_at,
         creator.full_name AS created_by_name
       FROM riders r
       LEFT JOIN staff_accounts creator ON creator.id = r.created_by
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );

    return res.json({
      data:  rows.map(sanitizeRider),
      total,
      page:  pageNum,
      limit: limitVal,
    });
  } catch (err) {
    console.error('[listRiders]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * GET /api/admin/riders/:id
 * Single rider detail.
 */
exports.getRider = async (req, res) => {
  try {
    const riderId = parseInt(req.params.id, 10);
    if (isNaN(riderId)) return res.status(400).json({ message: 'Invalid rider ID.' });

    const { rows } = await db.query(
      `SELECT
         r.*, creator.full_name AS created_by_name
       FROM riders r
       LEFT JOIN staff_accounts creator ON creator.id = r.created_by
       WHERE r.id = $1`,
      [riderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Rider not found.' });
    }

    return res.json({ data: sanitizeRider(rows[0]) });
  } catch (err) {
    console.error('[getRider]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * POST /api/admin/riders
 * Register a new rider.
 * Body: { full_name, mobile_number, email?, plate_number?, vehicle_type?, notes?, password }
 */
exports.createRider = async (req, res) => {
  const client = await db.getClient();
  try {
    const adminId = req.user.sub;
    const {
      full_name,
      mobile_number,
      email,
      plate_number,
      vehicle_type,
      notes,
      password,
    } = req.body;

    // ── Validation ───────────────────────────────────────────────────────────
    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ message: 'full_name is required.' });
    }
    if (!mobile_number || !mobile_number.trim()) {
      return res.status(400).json({ message: 'mobile_number is required.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'password must be at least 8 characters.' });
    }
    if (vehicle_type && !VALID_VEHICLES.includes(vehicle_type)) {
      return res.status(400).json({
        message: `Invalid vehicle_type. Must be one of: ${VALID_VEHICLES.join(', ')}.`,
      });
    }

    const normalizedEmail  = email  ? email.toLowerCase().trim()  : null;
    const normalizedMobile = mobile_number.trim();

    await client.query('BEGIN');

    // Check mobile uniqueness
    const { rows: existMobile } = await client.query(
      'SELECT id FROM riders WHERE mobile_number = $1',
      [normalizedMobile]
    );
    if (existMobile.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A rider with this mobile number already exists.' });
    }

    // Check email uniqueness (only if provided)
    if (normalizedEmail) {
      const { rows: existEmail } = await client.query(
        'SELECT id FROM riders WHERE email = $1',
        [normalizedEmail]
      );
      if (existEmail.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'A rider with this email already exists.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows } = await client.query(
      `INSERT INTO riders
         (full_name, mobile_number, email, password_hash, plate_number, vehicle_type, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', $8)
       RETURNING *`,
      [
        full_name.trim(),
        normalizedMobile,
        normalizedEmail,
        passwordHash,
        plate_number ? plate_number.trim() : null,
        vehicle_type || null,
        notes        ? notes.trim()        : null,
        adminId,
      ]
    );
    const newRider = rows[0];

    await writeAuditLog(client, adminId, 'create_rider', 'riders', newRider.id, {
      full_name:    newRider.full_name,
      mobile_number: newRider.mobile_number,
      vehicle_type: newRider.vehicle_type,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Rider registered successfully.',
      data:    sanitizeRider(newRider),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createRider]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/admin/riders/:id
 * Update rider profile (name, contact, vehicle details, notes).
 * Cannot change status through this endpoint — use PATCH /status instead.
 */
exports.updateRider = async (req, res) => {
  const client = await db.getClient();
  try {
    const riderId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;

    if (isNaN(riderId)) return res.status(400).json({ message: 'Invalid rider ID.' });

    const {
      full_name,
      mobile_number,
      email,
      plate_number,
      vehicle_type,
      notes,
    } = req.body;

    // ── Validation ───────────────────────────────────────────────────────────
    if (full_name !== undefined && !full_name.trim()) {
      return res.status(400).json({ message: 'full_name cannot be empty.' });
    }
    if (mobile_number !== undefined && !mobile_number.trim()) {
      return res.status(400).json({ message: 'mobile_number cannot be empty.' });
    }
    if (vehicle_type && !VALID_VEHICLES.includes(vehicle_type)) {
      return res.status(400).json({
        message: `Invalid vehicle_type. Must be one of: ${VALID_VEHICLES.join(', ')}.`,
      });
    }

    await client.query('BEGIN');

    // Ensure rider exists
    const { rows: existing } = await client.query(
      'SELECT * FROM riders WHERE id = $1',
      [riderId]
    );
    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Rider not found.' });
    }

    const current = existing[0];

    const normalizedEmail  = email !== undefined
      ? (email ? email.toLowerCase().trim() : null)
      : current.email;
    const normalizedMobile = mobile_number
      ? mobile_number.trim()
      : current.mobile_number;

    // Check mobile uniqueness (excluding self)
    if (normalizedMobile !== current.mobile_number) {
      const { rows: mobileConflict } = await client.query(
        'SELECT id FROM riders WHERE mobile_number = $1 AND id <> $2',
        [normalizedMobile, riderId]
      );
      if (mobileConflict.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Another rider already uses this mobile number.' });
      }
    }

    // Check email uniqueness (excluding self, only if changing)
    if (normalizedEmail && normalizedEmail !== current.email) {
      const { rows: emailConflict } = await client.query(
        'SELECT id FROM riders WHERE email = $1 AND id <> $2',
        [normalizedEmail, riderId]
      );
      if (emailConflict.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Another rider already uses this email.' });
      }
    }

    const { rows: updated } = await client.query(
      `UPDATE riders SET
         full_name     = $1,
         mobile_number = $2,
         email         = $3,
         plate_number  = $4,
         vehicle_type  = $5,
         notes         = $6,
         updated_at    = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        full_name    ? full_name.trim()    : current.full_name,
        normalizedMobile,
        normalizedEmail,
        plate_number !== undefined ? (plate_number ? plate_number.trim() : null) : current.plate_number,
        vehicle_type !== undefined ? (vehicle_type || null) : current.vehicle_type,
        notes        !== undefined ? (notes ? notes.trim() : null)        : current.notes,
        riderId,
      ]
    );

    await writeAuditLog(client, adminId, 'update_rider', 'riders', riderId, {
      changed: Object.keys(req.body),
    });

    await client.query('COMMIT');

    return res.json({
      message: 'Rider updated successfully.',
      data:    sanitizeRider(updated[0]),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateRider]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/admin/riders/:id/status
 * Activate or deactivate a rider.
 * Body: { status: 'available' | 'inactive' }
 *
 * Note: 'on_delivery' is system-set only — cannot be manually assigned here.
 * Deactivating a rider who is currently on_delivery is blocked.
 */
exports.updateRiderStatus = async (req, res) => {
  const client = await db.getClient();
  try {
    const riderId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;
    const { status } = req.body;

    if (isNaN(riderId)) return res.status(400).json({ message: 'Invalid rider ID.' });
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Admin can only set: ${VALID_STATUSES.join(', ')}.`,
      });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id, full_name, status FROM riders WHERE id = $1',
      [riderId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Rider not found.' });
    }

    const rider = rows[0];

    // Cannot deactivate a rider who is currently on a delivery
    if (status === 'inactive' && rider.status === 'on_delivery') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Cannot deactivate a rider who is currently on a delivery. Wait for the delivery to complete.',
      });
    }

    // No-op check
    if (rider.status === status) {
      await client.query('ROLLBACK');
      return res.json({ message: `Rider is already ${status}.`, data: rider });
    }

    const { rows: updated } = await client.query(
      `UPDATE riders SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, full_name, mobile_number, email, plate_number, vehicle_type, notes, status, last_login, created_by, created_at, updated_at`,
      [status, riderId]
    );

    const action = status === 'available' ? 'reactivate_rider' : 'deactivate_rider';
    await writeAuditLog(client, adminId, action, 'riders', riderId, {
      previous_status: rider.status,
      new_status:      status,
    });

    await client.query('COMMIT');

    const label = status === 'available' ? 'reactivated' : 'deactivated';
    return res.json({
      message: `Rider ${label} successfully.`,
      data:    updated[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateRiderStatus]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * POST /api/admin/riders/:id/reset-password
 * Admin resets a rider's password.
 * Body: { new_password }
 */
exports.resetRiderPassword = async (req, res) => {
  const client = await db.getClient();
  try {
    const riderId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;
    const { new_password } = req.body;

    if (isNaN(riderId)) return res.status(400).json({ message: 'Invalid rider ID.' });
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ message: 'new_password must be at least 8 characters.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id FROM riders WHERE id = $1',
      [riderId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Rider not found.' });
    }

    const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);

    await client.query(
      'UPDATE riders SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, riderId]
    );

    await writeAuditLog(client, adminId, 'reset_rider_password', 'riders', riderId, {});

    await client.query('COMMIT');

    return res.json({ message: 'Rider password reset successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[resetRiderPassword]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * GET /api/admin/riders/available
 * Shortcut: list only riders with status = 'available'.
 * Used by the Staff delivery assignment dropdown.
 * Accessible by staff role as well (not just admin).
 */
exports.listAvailableRiders = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, mobile_number, plate_number, vehicle_type
       FROM riders
       WHERE status = 'available'
       ORDER BY full_name ASC`
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('[listAvailableRiders]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};