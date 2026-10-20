const db = require('../../config/db');
const { emitMenuUpdate } = require('../../sockets');
const {
  NOTIFICATION_CATEGORIES,
  normalizeNotificationSettings,
  readNotificationSettings,
} = require('./notificationSettings');

// ─── helpers ──────────────────────────────────────────────────────────────────

async function _getEnrichedItemForSocket(id) {
  const [itemRes, varRes] = await Promise.all([
    db.query(
      `SELECT mi.id, mi.category_id, mc.name AS category_name, mi.name, mi.description,
              mi.price, mi.image_url, mi.image_public_id, mi.is_available
         FROM menu_items mi
         JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE mi.id = $1 AND mi.is_deleted = FALSE`,
      [id]
    ),
    db.query(
      `SELECT miv.id, miv.name, miv.price, miv.is_available, miv.display_order,
              miv.variant_group_id, vg.name AS group_name
         FROM menu_item_variants miv
         LEFT JOIN variant_groups vg ON vg.id = miv.variant_group_id
        WHERE miv.menu_item_id = $1
        ORDER BY miv.display_order ASC, miv.id ASC`,
      [id]
    ),
  ]);
  if (itemRes.rows.length === 0) return null;
  return {
    ...itemRes.rows[0],
    price: parseFloat(itemRes.rows[0].price),
    variants: varRes.rows.map(r => {
      const out = {
        id: r.id,
        name: r.name,
        price: parseFloat(r.price),
        is_available: r.is_available,
        display_order: r.display_order,
      };
      if (r.variant_group_id != null) {
        out.group_id = r.variant_group_id;
        out.group_name = r.group_name ?? null;
      }
      return out;
    }),
  };
}

async function writeAuditLog(client, actorId, action, targetType, targetId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)]
  );
}

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
 * List all menu categories with how many menu items reference each.
 * item_count counts every menu_items row (soft-deleted included) — the same
 * rows that block deletion in deleteCategory.
 * Also includes variant_group_ids: the global variant groups this category
 * offers (from menu_category_variant_groups).
 */
exports.listCategories = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.name, COUNT(mi.id)::int AS item_count,
              COALESCE(
                (SELECT ARRAY_AGG(mcg.variant_group_id)
                   FROM menu_category_variant_groups mcg
                  WHERE mcg.category_id = c.id),
                '{}'
              ) AS variant_group_ids
         FROM menu_categories c
         LEFT JOIN menu_items mi ON mi.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY c.id ASC`
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

/**
 * PUT /api/admin/system-settings/menu-categories/:id/variants
 * Replace the set of global variant groups this category offers.
 * Body: { group_ids: [number] }
 *
 * Toggling a group OFF removes that group's menu_item_variants rows for
 * items in this category (order history keeps its variant_name snapshots).
 * Toggling a group ON creates nothing — the group simply appears in the
 * Menu Management item form for pricing.
 */
exports.updateCategoryVariants = async (req, res) => {
  const client = await db.getClient();
  try {
    const categoryId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;
    const { group_ids } = req.body || {};

    if (isNaN(categoryId)) return res.status(400).json({ message: 'Invalid category ID.' });
    if (!Array.isArray(group_ids) || group_ids.some(g => isNaN(parseInt(g, 10)))) {
      return res.status(400).json({ message: '`group_ids` must be an array of variant group ids.' });
    }
    const cleanIds = [...new Set(group_ids.map(g => parseInt(g, 10)))];

    await client.query('BEGIN');

    const cat = await client.query('SELECT id, name FROM menu_categories WHERE id = $1', [categoryId]);
    if (cat.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Category not found.' });
    }

    if (cleanIds.length > 0) {
      const { rows: valid } = await client.query(
        'SELECT id FROM variant_groups WHERE id = ANY($1::int[])',
        [cleanIds]
      );
      const validIds = new Set(valid.map(r => r.id));
      const missing = cleanIds.filter(id => !validIds.has(id));
      if (missing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Variant group(s) not found: ${missing.join(', ')}.` });
      }
    }

    // Current linked group ids
    const current = await client.query(
      'SELECT variant_group_id FROM menu_category_variant_groups WHERE category_id = $1',
      [categoryId]
    );
    const currentIds = new Set(current.rows.map(r => r.variant_group_id));
    const removedIds = [...currentIds].filter(id => !cleanIds.includes(id));

    // Replace links
    await client.query('DELETE FROM menu_category_variant_groups WHERE category_id = $1', [categoryId]);
    for (const gid of cleanIds) {
      await client.query(
        'INSERT INTO menu_category_variant_groups (category_id, variant_group_id) VALUES ($1, $2)',
        [categoryId, gid]
      );
    }

    // For removed groups: delete that group's menu_item_variants for items in this category
    let affectedItemIds = [];
    if (removedIds.length > 0) {
      const { rows: affected } = await client.query(
        `DELETE FROM menu_item_variants miv
          USING menu_items mi
          WHERE miv.menu_item_id = mi.id
            AND mi.category_id = $1
            AND miv.variant_group_id = ANY($2::int[])
          RETURNING miv.menu_item_id`,
        [categoryId, removedIds]
      );
      affectedItemIds = affected.map(r => r.menu_item_id);
    }

    await writeAuditLog(client, adminId, 'update_category_variants', 'menu_categories', categoryId, {
      category: cat.rows[0].name,
      group_ids: cleanIds,
      removed_group_ids: removedIds,
    });

    await client.query('COMMIT');

    // Emit updates for items that lost variants
    for (const itemId of affectedItemIds) {
      const item = await _getEnrichedItemForSocket(itemId);
      if (item) emitMenuUpdate(item);
    }

    const { rows: refreshed } = await db.query(
      `SELECT c.id, c.name, COUNT(mi.id)::int AS item_count,
              COALESCE(
                (SELECT ARRAY_AGG(mcg.variant_group_id)
                   FROM menu_category_variant_groups mcg
                  WHERE mcg.category_id = c.id),
                '{}'
              ) AS variant_group_ids
         FROM menu_categories c
         LEFT JOIN menu_items mi ON mi.category_id = c.id
        WHERE c.id = $1
        GROUP BY c.id, c.name`,
      [categoryId]
    );

    return res.json({ message: 'Category variants updated.', data: refreshed[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateCategoryVariants]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MENU VARIANTS (reusable variant groups)
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_GROUP_SELECT = `
  SELECT g.id, g.name, g.max_options
    FROM variant_groups g`;

function formatVariantGroup(row) {
  return {
    id: row.id,
    name: row.name,
    max_options: row.max_options,
  };
}

async function fetchVariantGroup(queryable, id) {
  const { rows } = await queryable.query(
    `${VARIANT_GROUP_SELECT} WHERE g.id = $1`,
    [id]
  );
  return rows[0] ? formatVariantGroup(rows[0]) : null;
}

const MAX_OPTIONS_MIN = 1;
const MAX_OPTIONS_MAX = 10;

/**
 * Validate `{ name, max_options }` for create/update. Returns `{ error }` or the
 * trimmed values. Mirrors the frontend's messages.
 */
function validateVariantGroupBody(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'Variant name is required.' };
  if (name.length > 100) return { error: 'Variant names must be 100 characters or fewer.' };

  const maxOptions = Number(body?.max_options);
  if (!Number.isInteger(maxOptions) || maxOptions < MAX_OPTIONS_MIN || maxOptions > MAX_OPTIONS_MAX) {
    return { error: `Max options must be a whole number between ${MAX_OPTIONS_MIN} and ${MAX_OPTIONS_MAX}.` };
  }

  return { name, max_options: maxOptions };
}

/**
 * GET /api/admin/system-settings/variants
 * List every variant group (name + max options).
 */
exports.listVariantGroups = async (req, res) => {
  try {
    const { rows } = await db.query(`${VARIANT_GROUP_SELECT} ORDER BY g.id ASC`);
    return res.json({ data: rows.map(formatVariantGroup) });
  } catch (err) {
    console.error('[listVariantGroups]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * POST /api/admin/system-settings/variants
 * Create a variant group.
 * Body: { name, max_options }
 */
exports.createVariantGroup = async (req, res) => {
  const client = await db.getClient();
  try {
    const adminId = req.user.sub;

    const parsed = validateVariantGroupBody(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    await client.query('BEGIN');

    const dupe = await client.query(
      'SELECT id FROM variant_groups WHERE LOWER(name) = LOWER($1)',
      [parsed.name]
    );
    if (dupe.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A variant with this name already exists.' });
    }

    const { rows } = await client.query(
      'INSERT INTO variant_groups (name, max_options) VALUES ($1, $2) RETURNING id',
      [parsed.name, parsed.max_options]
    );
    const groupId = rows[0].id;

    await writeAuditLog(client, adminId, 'create_variant_group', 'variant_groups', groupId, {
      name: parsed.name,
      max_options: parsed.max_options,
    });

    const group = await fetchVariantGroup(client, groupId);
    await client.query('COMMIT');

    return res.status(201).json({ message: 'Variant created successfully.', data: group });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createVariantGroup]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * PATCH /api/admin/system-settings/variants/:id
 * Rename a variant group and/or change its max option count. Option names and
 * prices live on each menu item, so nothing here propagates to items; lowering
 * max_options leaves existing item rows untouched (enforced on next item save).
 * Body: { name, max_options }
 */
exports.updateVariantGroup = async (req, res) => {
  const client = await db.getClient();
  try {
    const groupId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;

    if (isNaN(groupId)) return res.status(400).json({ message: 'Invalid variant ID.' });

    const parsed = validateVariantGroupBody(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id, name FROM variant_groups WHERE id = $1',
      [groupId]
    );
    if (existing.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Variant not found.' });
    }

    const dupe = await client.query(
      'SELECT id FROM variant_groups WHERE LOWER(name) = LOWER($1) AND id != $2',
      [parsed.name, groupId]
    );
    if (dupe.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'A variant with this name already exists.' });
    }

    await client.query(
      'UPDATE variant_groups SET name = $1, max_options = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [parsed.name, parsed.max_options, groupId]
    );

    await writeAuditLog(client, adminId, 'update_variant_group', 'variant_groups', groupId, {
      old_name: existing.rows[0].name,
      new_name: parsed.name,
      max_options: parsed.max_options,
    });

    const group = await fetchVariantGroup(client, groupId);
    await client.query('COMMIT');

    return res.json({ message: 'Variant updated successfully.', data: group });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateVariantGroup]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/admin/system-settings/variants/:id
 * Delete a variant group. Category links and linked menu_item_variants follow
 * via ON DELETE CASCADE. Affected menu items are emitted via menu_update.
 */
exports.deleteVariantGroup = async (req, res) => {
  const client = await db.getClient();
  try {
    const groupId = parseInt(req.params.id, 10);
    const adminId = req.user.sub;

    if (isNaN(groupId)) return res.status(400).json({ message: 'Invalid variant ID.' });

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id, name FROM variant_groups WHERE id = $1',
      [groupId]
    );
    if (existing.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Variant not found.' });
    }

    // Collect affected menu items before cascade removes the rows
    const { rows: affected } = await client.query(
      `SELECT DISTINCT menu_item_id FROM menu_item_variants WHERE variant_group_id = $1`,
      [groupId]
    );

    await client.query('DELETE FROM variant_groups WHERE id = $1', [groupId]);

    await writeAuditLog(client, adminId, 'delete_variant_group', 'variant_groups', groupId, {
      name: existing.rows[0].name,
    });

    await client.query('COMMIT');

    for (const r of affected) {
      const item = await _getEnrichedItemForSocket(r.menu_item_id);
      if (item) emitMenuUpdate(item);
    }

    return res.json({ message: `Variant "${existing.rows[0].name}" deleted successfully.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[deleteVariantGroup]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/system-settings/notifications
 * Returns which event categories are visible in the admin notification bell.
 */
exports.getNotificationSettings = async (req, res) => {
  try {
    const settings = await readNotificationSettings();
    return res.json({ data: settings });
  } catch (err) {
    console.error('[getNotificationSettings]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

/**
 * PUT /api/admin/system-settings/notifications
 * Body: { categories: { orders, payments, deliveries, inventory, kitchen, customers, system } }
 *
 * Bulk-save, mirroring the business-hours pattern: all 7 categories must be
 * present, each a boolean. At least nothing is enforced to remain enabled —
 * hiding every category is a valid choice.
 */
exports.saveNotificationSettings = async (req, res) => {
  const client = await db.getClient();
  try {
    const adminId = req.user.sub;
    const { categories } = req.body || {};

    if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
      return res.status(400).json({ message: '`categories` must be an object of boolean flags.' });
    }
    const missing = NOTIFICATION_CATEGORIES.filter((c) => !(c in categories));
    if (missing.length > 0) {
      return res.status(400).json({ message: `Missing notification categories: ${missing.join(', ')}.` });
    }
    const unknown = Object.keys(categories).filter((k) => !NOTIFICATION_CATEGORIES.includes(k));
    if (unknown.length > 0) {
      return res.status(400).json({ message: `Unknown notification categories: ${unknown.join(', ')}.` });
    }
    const invalid = NOTIFICATION_CATEGORIES.filter((c) => typeof categories[c] !== 'boolean');
    if (invalid.length > 0) {
      return res.status(400).json({ message: `Category values must be true or false: ${invalid.join(', ')}.` });
    }

    const settings = normalizeNotificationSettings({ categories });

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('notifications', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(settings)]
    );

    await writeAuditLog(client, adminId, 'update_notification_settings', 'system_settings', null, {
      categories: settings.categories,
    });

    await client.query('COMMIT');

    return res.json({ message: 'Notification settings saved successfully.', data: settings });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[saveNotificationSettings]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};