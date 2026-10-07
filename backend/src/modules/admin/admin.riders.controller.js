const bcrypt = require('bcrypt');
const db = require('../../config/db');

const BCRYPT_ROUNDS = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── GET /api/admin/riders ────────────────────────────────────────────────────
// List all riders (all statuses). Admin only.
exports.listRiders = async (req, res) => {
  try {
    const { status } = req.query;

    const conditions = ['1=1'];
    const params = [];
    let p = 1;

    if (status && ['available', 'on_delivery', 'inactive'].includes(status)) {
      conditions.push(`r.status = $${p++}`);
      params.push(status);
    }

    const { rows } = await db.query(
      `SELECT
         r.id,
         r.full_name,
         r.mobile_number,
         r.email,
         r.plate_number,
         r.vehicle_type,
         r.notes,
         r.status,
         r.last_login,
         r.created_at,
         r.updated_at,
         r.created_by,
         creator.full_name AS created_by_name
       FROM riders r
       LEFT JOIN staff_accounts creator ON creator.id = r.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_at DESC`,
      params
    );

    res.json({ riders: rows.map(sanitizeRider) });
  } catch (err) {
    console.error('[admin.riders] listRiders:', err);
    res.status(500).json({ message: 'Failed to fetch riders.' });
  }
};

// ─── GET /api/admin/riders/:id ────────────────────────────────────────────────
exports.getRider = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
         r.*,
         creator.full_name AS created_by_name
       FROM riders r
       LEFT JOIN staff_accounts creator ON creator.id = r.created_by
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ message: 'Rider not found.' });
    res.json(sanitizeRider(rows[0]));
  } catch (err) {
    console.error('[admin.riders] getRider:', err);
    res.status(500).json({ message: 'Failed to fetch rider.' });
  }
};

// ─── POST /api/admin/riders ───────────────────────────────────────────────────
// Create a new rider account.
// Body: { full_name, mobile_number, email?, plate_number?, vehicle_type?, notes?, password? }
exports.createRider = async (req, res) => {
  const client = await db.getClient();
  try {
    const {
      full_name,
      mobile_number,
      email,
      plate_number,
      vehicle_type,
      notes,
      password,
    } = req.body;

    if (!full_name?.trim()) {
      return res.status(400).json({ message: 'full_name is required.' });
    }
    if (!mobile_number?.trim()) {
      return res.status(400).json({ message: 'mobile_number is required.' });
    }

    // Check uniqueness
    const { rows: existing } = await client.query(
      `SELECT id FROM riders WHERE mobile_number = $1 OR (email IS NOT NULL AND email = $2)`,
      [mobile_number.trim(), email?.trim() || null]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        message: 'A rider with this mobile number or email already exists.',
      });
    }

    // Hash password if provided; otherwise NULL (rider sets it on first login via reset flow)
    let passwordHash = null;
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters.' });
      }
      passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO riders
         (full_name, mobile_number, email, password_hash,
          plate_number, vehicle_type, notes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', $8)
       RETURNING *`,
      [
        full_name.trim(),
        mobile_number.trim(),
        email?.trim() || null,
        passwordHash,
        plate_number?.trim() || null,
        vehicle_type?.trim() || null,
        notes?.trim() || null,
        req.user.sub,
      ]
    );

    const rider = rows[0];

    await writeAuditLog(client, req.user.sub, 'create_rider', 'rider', rider.id, {
      full_name: rider.full_name,
      mobile_number: rider.mobile_number,
      email: rider.email,
    });

    await client.query('COMMIT');

    res.status(201).json(sanitizeRider(rider));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[admin.riders] createRider:', err);
    res.status(500).json({ message: 'Failed to create rider.' });
  } finally {
    client.release();
  }
};

// ─── PUT /api/admin/riders/:id ────────────────────────────────────────────────
// Update rider info (name, contact, vehicle, notes). Does NOT change status.
exports.updateRider = async (req, res) => {
  const client = await db.getClient();
  try {
    const riderId = parseInt(req.params.id, 10);
    const { full_name, mobile_number, email, plate_number, vehicle_type, notes } = req.body;

    // Fetch current for audit diff
    const { rows: current } = await client.query(
      `SELECT * FROM riders WHERE id = $1`,
      [riderId]
    );
    if (!current[0]) return res.status(404).json({ message: 'Rider not found.' });

    // Check mobile/email uniqueness if changed
    if (mobile_number?.trim() && mobile_number.trim() !== current[0].mobile_number) {
      const { rows: dup } = await client.query(
        `SELECT id FROM riders WHERE mobile_number = $1 AND id <> $2`,
        [mobile_number.trim(), riderId]
      );
      if (dup.length) return res.status(409).json({ message: 'Mobile number already in use.' });
    }
    if (email?.trim() && email.trim() !== current[0].email) {
      const { rows: dup } = await client.query(
        `SELECT id FROM riders WHERE email = $1 AND id <> $2`,
        [email.trim(), riderId]
      );
      if (dup.length) return res.status(409).json({ message: 'Email already in use.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE riders SET
         full_name     = COALESCE($1, full_name),
         mobile_number = COALESCE($2, mobile_number),
         email         = COALESCE($3, email),
         plate_number  = COALESCE($4, plate_number),
         vehicle_type  = COALESCE($5, vehicle_type),
         notes         = COALESCE($6, notes),
         updated_at    = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        full_name?.trim() || null,
        mobile_number?.trim() || null,
        email?.trim() || null,
        plate_number?.trim() || null,
        vehicle_type?.trim() || null,
        notes?.trim() || null,
        riderId,
      ]
    );

    await writeAuditLog(client, req.user.sub, 'update_rider', 'rider', riderId, {
      before: {
        full_name: current[0].full_name,
        mobile_number: current[0].mobile_number,
        email: current[0].email,
        plate_number: current[0].plate_number,
        vehicle_type: current[0].vehicle_type,
      },
      after: {
        full_name: rows[0].full_name,
        mobile_number: rows[0].mobile_number,
        email: rows[0].email,
        plate_number: rows[0].plate_number,
        vehicle_type: rows[0].vehicle_type,
      },
    });

    await client.query('COMMIT');

    res.json(sanitizeRider(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[admin.riders] updateRider:', err);
    res.status(500).json({ message: 'Failed to update rider.' });
  } finally {
    client.release();
  }
};

// ─── PATCH /api/admin/riders/:id/status ──────────────────────────────────────
// Activate or deactivate a rider.
// Body: { status: 'available' | 'inactive' }
// Note: 'on_delivery' is system-set only; admin cannot force it.
exports.updateRiderStatus = async (req, res) => {
  const client = await db.getClient();
  try {
    const riderId = parseInt(req.params.id, 10);
    const { status } = req.body;

    const ADMIN_SETTABLE = ['available', 'inactive'];
    if (!ADMIN_SETTABLE.includes(status)) {
      return res.status(400).json({
        message: `status must be one of: ${ADMIN_SETTABLE.join(', ')}`,
      });
    }

    await client.query('BEGIN');

    const { rows: current } = await client.query(
      `SELECT id, status, full_name FROM riders WHERE id = $1 FOR UPDATE`,
      [riderId]
    );
    if (!current[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Rider not found.' });
    }

    // Prevent deactivating a rider who's currently on a delivery
    if (status === 'inactive' && current[0].status === 'on_delivery') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Cannot deactivate a rider who is currently on a delivery. Wait until they complete it.',
      });
    }

    const { rows } = await client.query(
      `UPDATE riders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, riderId]
    );

    await writeAuditLog(client, req.user.sub, 'update_rider_status', 'rider', riderId, {
      from: current[0].status,
      to: status,
      rider_name: current[0].full_name,
    });

    await client.query('COMMIT');

    res.json(sanitizeRider(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[admin.riders] updateRiderStatus:', err);
    res.status(500).json({ message: 'Failed to update rider status.' });
  } finally {
    client.release();
  }
};

// ─── POST /api/admin/riders/:id/reset-password ───────────────────────────────
// Admin sets a new password for a rider.
// Body: { password }
exports.resetRiderPassword = async (req, res) => {
  const client = await db.getClient();
  try {
    const riderId = parseInt(req.params.id, 10);
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const { rows: check } = await client.query(
      `SELECT id, full_name FROM riders WHERE id = $1`,
      [riderId]
    );
    if (!check[0]) return res.status(404).json({ message: 'Rider not found.' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await client.query('BEGIN');

    await client.query(
      `UPDATE riders SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, riderId]
    );

    await writeAuditLog(client, req.user.sub, 'reset_rider_password', 'rider', riderId, {
      rider_name: check[0].full_name,
    });

    await client.query('COMMIT');

    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[admin.riders] resetRiderPassword:', err);
    res.status(500).json({ message: 'Failed to reset password.' });
  } finally {
    client.release();
  }
};