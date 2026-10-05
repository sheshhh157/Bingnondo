const db = require('../../config/db');

// ─── helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog(client, actorId, action, targetType, targetId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESP32 DEVICES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/system-settings/esp32-devices
 * List all registered ESP32 devices.
 */
exports.listDevices = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, device_code, location_label, status, last_ping_at
       FROM esp32_devices
       ORDER BY id ASC`
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('[listDevices]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * POST /api/admin/system-settings/esp32-devices
 * Register a new ESP32 device.
 * Body: { device_code, location_label }
 */
exports.registerDevice = async (req, res) => {
  const client = await db.getClient();
  try {
    const { device_code, location_label } = req.body;
    const adminId = req.user.sub;

    if (!device_code || !device_code.trim()) {
      return res.status(400).json({ message: 'device_code is required.' });
    }
    if (!location_label || !location_label.trim()) {
      return res.status(400).json({ message: 'location_label is required.' });
    }

    // device_code must be alphanumeric + hyphens/underscores only
    if (!/^[A-Za-z0-9_-]+$/.test(device_code.trim())) {
      return res.status(400).json({
        message: 'device_code may only contain letters, numbers, hyphens, and underscores.',
      });
    }

    await client.query('BEGIN');

    // Check uniqueness
    const { rows: existing } = await client.query(
      'SELECT id FROM esp32_devices WHERE device_code = $1',
      [device_code.trim().toUpperCase()]
    );
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A device with this code already exists.' });
    }

    const { rows } = await client.query(
      `INSERT INTO esp32_devices (device_code, location_label, status)
       VALUES ($1, $2, 'offline')
       RETURNING id, device_code, location_label, status, last_ping_at`,
      [device_code.trim().toUpperCase(), location_label.trim()]
    );
    const device = rows[0];

    await writeAuditLog(client, adminId, 'register_esp32_device', 'esp32_devices', device.id, {
      device_code: device.device_code,
      location_label: device.location_label,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'ESP32 device registered successfully.',
      data: device,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[registerDevice]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/admin/system-settings/esp32-devices/:id
 * Update a device's location label.
 * Body: { location_label }
 */
exports.updateDevice = async (req, res) => {
  const client = await db.getClient();
  try {
    const deviceId = parseInt(req.params.id, 10);
    const adminId  = req.user.sub;
    const { location_label } = req.body;

    if (isNaN(deviceId)) return res.status(400).json({ message: 'Invalid device ID.' });
    if (!location_label || !location_label.trim()) {
      return res.status(400).json({ message: 'location_label is required.' });
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE esp32_devices
       SET location_label = $1
       WHERE id = $2
       RETURNING id, device_code, location_label, status, last_ping_at`,
      [location_label.trim(), deviceId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Device not found.' });
    }

    await writeAuditLog(client, adminId, 'update_esp32_device', 'esp32_devices', deviceId, {
      location_label: location_label.trim(),
    });

    await client.query('COMMIT');

    return res.json({
      message: 'Device updated successfully.',
      data: rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateDevice]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/admin/system-settings/esp32-devices/:id
 * Remove a registered device.
 */
exports.deleteDevice = async (req, res) => {
  const client = await db.getClient();
  try {
    const deviceId = parseInt(req.params.id, 10);
    const adminId  = req.user.sub;

    if (isNaN(deviceId)) return res.status(400).json({ message: 'Invalid device ID.' });

    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id, device_code, location_label FROM esp32_devices WHERE id = $1',
      [deviceId]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Device not found.' });
    }

    await client.query('DELETE FROM esp32_devices WHERE id = $1', [deviceId]);

    await writeAuditLog(client, adminId, 'delete_esp32_device', 'esp32_devices', deviceId, {
      device_code:    rows[0].device_code,
      location_label: rows[0].location_label,
    });

    await client.query('COMMIT');

    return res.json({ message: 'Device removed successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[deleteDevice]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS HOURS
// ─────────────────────────────────────────────────────────────────────────────

// day_of_week follows JS convention: 0 = Sunday … 6 = Saturday
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * GET /api/admin/system-settings/business-hours
 * Returns all 7 rows ordered Mon–Sun (display order).
 */
exports.getBusinessHours = async (req, res) => {
  try {
    // Display order: Mon(1) to Sat(6) then Sun(0)
    const { rows } = await db.query(
      `SELECT id, day_of_week, open_time, close_time, is_closed, updated_at
       FROM business_hours
       ORDER BY CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END ASC`
    );
    const data = rows.map(r => ({ ...r, day_label: DAY_LABELS[r.day_of_week] }));
    return res.json({ data });
  } catch (err) {
    console.error('[getBusinessHours]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * PUT /api/admin/system-settings/business-hours
 * Bulk-save all 7 days in one call (matches the "Save hours" button in the UI).
 * Body: { hours: [ { day_of_week, open_time, close_time, is_closed }, ... ] }
 *
 * Rules:
 * - Must include all 7 days (0–6).
 * - If is_closed = true, open_time and close_time are ignored (stored as NULL).
 * - Times must be "HH:MM" 24-hour strings when is_closed = false.
 */
exports.saveBusinessHours = async (req, res) => {
  const client = await db.getClient();
  try {
    const { hours } = req.body;
    const adminId = req.user.sub;

    if (!Array.isArray(hours) || hours.length !== 7) {
      return res.status(400).json({ message: '`hours` must be an array of exactly 7 day entries.' });
    }

    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
    const seen = new Set();

    for (const entry of hours) {
      const day = parseInt(entry.day_of_week, 10);
      if (isNaN(day) || day < 0 || day > 6) {
        return res.status(400).json({ message: `Invalid day_of_week: ${entry.day_of_week}` });
      }
      if (seen.has(day)) {
        return res.status(400).json({ message: `Duplicate day_of_week: ${day}` });
      }
      seen.add(day);

      if (!entry.is_closed) {
        if (!TIME_RE.test(entry.open_time)) {
          return res.status(400).json({
            message: `open_time for ${DAY_LABELS[day]} must be in HH:MM format.`,
          });
        }
        if (!TIME_RE.test(entry.close_time)) {
          return res.status(400).json({
            message: `close_time for ${DAY_LABELS[day]} must be in HH:MM format.`,
          });
        }
        if (entry.open_time >= entry.close_time) {
          return res.status(400).json({
            message: `open_time must be before close_time for ${DAY_LABELS[day]}.`,
          });
        }
      }
    }

    await client.query('BEGIN');

    for (const entry of hours) {
      const day       = parseInt(entry.day_of_week, 10);
      const isClosed  = !!entry.is_closed;
      const openTime  = isClosed ? null : entry.open_time;
      const closeTime = isClosed ? null : entry.close_time;

      await client.query(
        `UPDATE business_hours
         SET open_time  = $1,
             close_time = $2,
             is_closed  = $3,
             updated_by = $4,
             updated_at = NOW()
         WHERE day_of_week = $5`,
        [openTime, closeTime, isClosed, adminId, day]
      );
    }

    await writeAuditLog(client, adminId, 'update_business_hours', 'business_hours', null, {
      days_updated: hours.map(h => DAY_LABELS[parseInt(h.day_of_week, 10)]),
    });

    await client.query('COMMIT');

    // Return updated rows
    const { rows } = await db.query(
      `SELECT id, day_of_week, open_time, close_time, is_closed, updated_at
       FROM business_hours
       ORDER BY CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END ASC`
    );
    const data = rows.map(r => ({ ...r, day_label: DAY_LABELS[r.day_of_week] }));

    return res.json({ message: 'Business hours saved successfully.', data });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[saveBusinessHours]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MENU CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/system-settings/menu-categories
 * List all menu categories.
 */
exports.listCategories = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name FROM menu_categories ORDER BY id ASC'
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('[listCategories]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * POST /api/admin/system-settings/menu-categories
 * Add a new category.
 * Body: { name }
 */
exports.createCategory = async (req, res) => {
  const client = await db.getClient();
  try {
    const { name } = req.body;
    const adminId  = req.user.sub;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required.' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ message: 'Category name must be 100 characters or fewer.' });
    }

    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT id FROM menu_categories WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A category with this name already exists.' });
    }

    const { rows } = await client.query(
      'INSERT INTO menu_categories (name) VALUES ($1) RETURNING id, name',
      [name.trim()]
    );
    const category = rows[0];

    await writeAuditLog(client, adminId, 'create_menu_category', 'menu_categories', category.id, {
      name: category.name,
    });

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Category created successfully.',
      data: category,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createCategory]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/admin/system-settings/menu-categories/:id
 * Rename a category.
 * Body: { name }
 */
exports.updateCategory = async (req, res) => {
  const client = await db.getClient();
  try {
    const categoryId = parseInt(req.params.id, 10);
    const adminId    = req.user.sub;
    const { name }   = req.body;

    if (isNaN(categoryId)) return res.status(400).json({ message: 'Invalid category ID.' });
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required.' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ message: 'Category name must be 100 characters or fewer.' });
    }

    await client.query('BEGIN');

    // Check the category exists
    const { rows: existing } = await client.query(
      'SELECT id, name FROM menu_categories WHERE id = $1',
      [categoryId]
    );
    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Category not found.' });
    }

    // Check name uniqueness (excluding self)
    const { rows: conflict } = await client.query(
      'SELECT id FROM menu_categories WHERE LOWER(name) = LOWER($1) AND id != $2',
      [name.trim(), categoryId]
    );
    if (conflict.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A category with this name already exists.' });
    }

    const { rows } = await client.query(
      'UPDATE menu_categories SET name = $1 WHERE id = $2 RETURNING id, name',
      [name.trim(), categoryId]
    );

    await writeAuditLog(client, adminId, 'update_menu_category', 'menu_categories', categoryId, {
      old_name: existing[0].name,
      new_name: name.trim(),
    });

    await client.query('COMMIT');

    return res.json({
      message: 'Category updated successfully.',
      data: rows[0],
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateCategory]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/admin/system-settings/menu-categories/:id
 * Delete a category. Blocked if menu items are still using it.
 */
exports.deleteCategory = async (req, res) => {
  const client = await db.getClient();
  try {
    const categoryId = parseInt(req.params.id, 10);
    const adminId    = req.user.sub;

    if (isNaN(categoryId)) return res.status(400).json({ message: 'Invalid category ID.' });

    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT id, name FROM menu_categories WHERE id = $1',
      [categoryId]
    );
    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Category not found.' });
    }

    // Block deletion if menu items are still linked
    const { rows: inUse } = await client.query(
      'SELECT COUNT(*) AS count FROM menu_items WHERE category_id = $1',
      [categoryId]
    );
    if (parseInt(inUse[0].count, 10) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Cannot delete "${existing[0].name}" — ${inUse[0].count} menu item(s) still use this category. Reassign or delete them first.`,
      });
    }

    await client.query('DELETE FROM menu_categories WHERE id = $1', [categoryId]);

    await writeAuditLog(client, adminId, 'delete_menu_category', 'menu_categories', categoryId, {
      name: existing[0].name,
    });

    await client.query('COMMIT');

    return res.json({ message: `Category "${existing[0].name}" deleted successfully.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[deleteCategory]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};