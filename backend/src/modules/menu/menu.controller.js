const db = require('../../config/db');

// ─── Socket.io injection ──────────────────────────────────────────────────────
let _io = null;
function setIO(io) { _io = io; }

function emitMenuUpdate(item) {
  if (_io) _io.emit('menu_update', item);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function _parseVariant(r) {
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
}

function _groupVariants(rows) {
  const map = {};
  for (const row of rows) {
    if (!map[row.menu_item_id]) map[row.menu_item_id] = [];
    map[row.menu_item_id].push(_parseVariant(row));
  }
  return map;
}

// Returns an error message, or null when the variant payload is valid.
function _validateVariants(variants) {
  if (!Array.isArray(variants)) return 'variants must be an array.';
  const seen = new Set();
  for (const v of variants) {
    const name = typeof v?.name === 'string' ? v.name.trim() : '';
    if (!name) return 'Every variant needs a name.';
    if (name.length > 100) return 'Variant names must be 100 characters or fewer.';
    if (v.price == null || Number.isNaN(Number(v.price)) || Number(v.price) <= 0) {
      return `Variant "${name}" needs a price greater than zero.`;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return `Duplicate variant name "${name}".`;
    seen.add(key);
  }
  return null;
}

// True when the payload uses the grouped shape: [{ group_id, name, price }].
function _isGroupVariantPayload(variants) {
  return Array.isArray(variants) && variants.length > 0 &&
    variants.every(v => v && v.group_id != null);
}

// Validate group-mode variants: each entry needs a group_id, a name and a
// price > 0. Groups must be linked to the item's category, and each group may
// hold at most its max_options entries with no duplicate names.
// Returns { error } or { options: [{ group_id, name, price }] } in payload order.
async function _validateGroupVariants(client, categoryId, variants) {
  const seenPerGroup = new Map(); // group_id -> Set(lowercased name)
  const normalized = [];

  for (const v of variants) {
    const groupId = parseInt(v?.group_id, 10);
    if (isNaN(groupId)) return { error: 'Invalid variant group.' };

    const name = typeof v?.name === 'string' ? v.name.trim() : '';
    if (!name) return { error: 'Every option needs a name.' };
    if (name.length > 100) return { error: 'Option names must be 100 characters or fewer.' };

    const price = Number(v?.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { error: `Variant "${name}" needs a price greater than zero.` };
    }

    const seen = seenPerGroup.get(groupId) || new Set();
    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `Duplicate option name "${name}".` };
    seen.add(key);
    seenPerGroup.set(groupId, seen);

    normalized.push({ group_id: groupId, name, price });
  }

  const groupIds = [...seenPerGroup.keys()];
  const { rows: groupRows } = await client.query(
    'SELECT id, name, max_options FROM variant_groups WHERE id = ANY($1::int[])',
    [groupIds]
  );
  const groupMap = new Map(groupRows.map(r => [r.id, r]));
  for (const gid of groupIds) {
    if (!groupMap.has(gid)) return { error: `Variant group ${gid} not found.` };
  }

  const { rows: linkRows } = await client.query(
    'SELECT variant_group_id FROM menu_category_variant_groups WHERE category_id = $1 AND variant_group_id = ANY($2::int[])',
    [categoryId, groupIds]
  );
  const linked = new Set(linkRows.map(r => r.variant_group_id));
  const unlinked = groupIds.filter(gid => !linked.has(gid));
  if (unlinked.length > 0) {
    return { error: 'One or more variant groups are not enabled for this category.' };
  }

  for (const [gid, seen] of seenPerGroup) {
    const group = groupMap.get(gid);
    if (seen.size > group.max_options) {
      return { error: `"${group.name}" allows up to ${group.max_options} option${group.max_options === 1 ? '' : 's'}.` };
    }
  }

  return { options: normalized };
}

async function _getEnrichedItem(id) {
  const [itemRes, ingRes, varRes] = await Promise.all([
    db.query(
      `SELECT
         mi.id,
         mi.category_id,
         mc.name  AS category_name,
         mi.name,
         mi.description,
         mi.price,
         mi.image_url,
         mi.image_public_id,
         mi.is_available,
         mi.created_at,
         mi.updated_at
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE mi.id = $1 AND mi.is_deleted = FALSE`,
      [id]
    ),
    db.query(
      `SELECT
         mii.inventory_item_id,
         mii.quantity_required,
         inv.name,
         inv.unit,
         inv.current_stock
       FROM menu_item_ingredients mii
       JOIN inventory_items inv ON inv.id = mii.inventory_item_id
       WHERE mii.menu_item_id = $1
       ORDER BY inv.name ASC`,
      [id]
    ),
    db.query(
      `SELECT miv.id, miv.name, miv.price, miv.is_available, miv.display_order,
              miv.variant_group_id,
              vg.name AS group_name
         FROM menu_item_variants miv
         LEFT JOIN variant_groups vg ON vg.id = miv.variant_group_id
        WHERE miv.menu_item_id = $1
        ORDER BY miv.display_order ASC, miv.id ASC`,
      [id]
    ),
  ]);

  if (itemRes.rows.length === 0) return null;

  const item = itemRes.rows[0];
  return {
    ...item,
    price: parseFloat(item.price),
    variants: varRes.rows.map(_parseVariant),
    ingredients: ingRes.rows.map((r) => ({
      inventory_item_id: r.inventory_item_id,
      quantity_required: r.quantity_required != null ? parseFloat(r.quantity_required) : null,
      name: r.name,
      unit: r.unit,
      current_stock: parseFloat(r.current_stock),
    })),
  };
}

// ─── GET /api/menu ────────────────────────────────────────────────────────────
// Public — customers + cashier read-only view (no ingredients)
async function getPublicMenu(req, res, next) {
  try {
    const [catRes, itemRes, varRes] = await Promise.all([
      db.query('SELECT id, name FROM menu_categories ORDER BY name ASC'),
      db.query(`
        SELECT
          mi.id,
          mi.category_id,
          mc.name  AS category_name,
          mi.name,
          mi.description,
          mi.price,
          mi.image_url,
          mi.is_available
        FROM menu_items mi
        JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE mi.is_deleted = FALSE
        ORDER BY mc.name ASC, mi.name ASC
      `),
      db.query(`
        SELECT miv.menu_item_id, miv.id, miv.name, miv.price, miv.is_available, miv.display_order,
               miv.variant_group_id,
               vg.name AS group_name
          FROM menu_item_variants miv
          LEFT JOIN variant_groups vg ON vg.id = miv.variant_group_id
         ORDER BY miv.display_order ASC, miv.id ASC
      `),
    ]);

    const variantMap = _groupVariants(varRes.rows);

    res.json({
      categories: catRes.rows,
      items: itemRes.rows.map((r) => ({
        ...r,
        price: parseFloat(r.price),
        variants: variantMap[r.id] || [],
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/menu/staff ──────────────────────────────────────────────────────
// Staff view — enriched with linked ingredients per item
async function getStaffMenu(req, res, next) {
  try {
    const [catRes, itemRes, ingRes, varRes] = await Promise.all([
      db.query(`
        SELECT c.id, c.name,
               COALESCE(
                 (SELECT ARRAY_AGG(mcg.variant_group_id)
                    FROM menu_category_variant_groups mcg
                   WHERE mcg.category_id = c.id),
                 '{}'
               ) AS variant_group_ids
          FROM menu_categories c
         ORDER BY c.name ASC
      `),
      db.query(`
        SELECT
          mi.id,
          mi.category_id,
          mc.name  AS category_name,
          mi.name,
          mi.description,
          mi.price,
          mi.image_url,
          mi.image_public_id,
          mi.is_available,
          mi.created_at,
          mi.updated_at
        FROM menu_items mi
        JOIN menu_categories mc ON mc.id = mi.category_id
        WHERE mi.is_deleted = FALSE
        ORDER BY mc.name ASC, mi.name ASC
      `),
      db.query(`
        SELECT
          mii.menu_item_id,
          mii.inventory_item_id,
          mii.quantity_required,
          inv.name,
          inv.unit,
          inv.current_stock
        FROM menu_item_ingredients mii
        JOIN inventory_items inv ON inv.id = mii.inventory_item_id
        ORDER BY inv.name ASC
      `),
      db.query(`
        SELECT miv.menu_item_id, miv.id, miv.name, miv.price, miv.is_available, miv.display_order,
               miv.variant_group_id,
               vg.name AS group_name
          FROM menu_item_variants miv
          LEFT JOIN variant_groups vg ON vg.id = miv.variant_group_id
         ORDER BY miv.display_order ASC, miv.id ASC
      `),
    ]);

    // Group ingredients by menu_item_id
    const ingMap = {};
    for (const row of ingRes.rows) {
      if (!ingMap[row.menu_item_id]) ingMap[row.menu_item_id] = [];
      ingMap[row.menu_item_id].push({
        inventory_item_id: row.inventory_item_id,
        quantity_required: row.quantity_required != null ? parseFloat(row.quantity_required) : null,
        name: row.name,
        unit: row.unit,
        current_stock: parseFloat(row.current_stock),
      });
    }

    const variantMap = _groupVariants(varRes.rows);

    res.json({
      categories: catRes.rows,
      items: itemRes.rows.map((item) => ({
        ...item,
        price: parseFloat(item.price),
        variants: variantMap[item.id] || [],
        ingredients: ingMap[item.id] || [],
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/menu/:id ────────────────────────────────────────────────────────
// Staff: single item detail with ingredients
async function getMenuItemById(req, res, next) {
  try {
    const item = await _getEnrichedItem(req.params.id);
    if (!item) return res.status(404).json({ message: 'Menu item not found.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/menu ───────────────────────────────────────────────────────────
// Staff: create a new menu item (+ optional ingredient links in one transaction)
async function createMenuItem(req, res, next) {
  const client = await db.getClient();
  try {
    const {
      name,
      price,
      description    = null,
      category_id,
      is_available   = true,
      image_url      = null,
      image_public_id = null,
      ingredients    = [],
      variants       = [],
    } = req.body;

    if (!name?.trim())                return res.status(400).json({ message: 'Item name is required.' });
    if (!price || Number(price) <= 0) return res.status(400).json({ message: 'A valid price is required.' });
    if (!category_id)                 return res.status(400).json({ message: 'Category is required.' });

    const isGroupMode = req.body.variants_mode === 'group' || _isGroupVariantPayload(variants);
    let validatedOptions = [];
    if (isGroupMode) {
      if (variants.length > 0) {
        const v = await _validateGroupVariants(client, category_id, variants);
        if (v.error) return res.status(400).json({ message: v.error });
        validatedOptions = v.options;
      }
    } else if (variants.length > 0) {
      const variantErr = _validateVariants(variants);
      if (variantErr) return res.status(400).json({ message: variantErr });
    }

    await client.query('BEGIN');

    const itemRes = await client.query(
      `INSERT INTO menu_items (category_id, name, description, price, image_url, image_public_id, is_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [category_id, name.trim(), description, Number(price), image_url, image_public_id, is_available]
    );
    const newId = itemRes.rows[0].id;

    if (ingredients.length > 0) {
      const values = ingredients.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
      const params = ingredients.flatMap((ing) => [
        newId,
        ing.inventory_item_id,
        ing.quantity_required != null && Number(ing.quantity_required) > 0 ? Number(ing.quantity_required) : null,
      ]);
      await client.query(
        `INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required) VALUES ${values}`,
        params
      );
    }

    if (isGroupMode && validatedOptions.length > 0) {
      const values = validatedOptions.map((_, i) =>
        `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
      ).join(', ');
      const params = validatedOptions.flatMap((o, i) => [
        newId, o.name, o.price, true, i, o.group_id,
      ]);
      await client.query(
        `INSERT INTO menu_item_variants (menu_item_id, name, price, is_available, display_order, variant_group_id)
         VALUES ${values}`,
        params
      );
    } else if (variants.length > 0) {
      const values = variants.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ');
      const params = variants.flatMap((v, i) => [
        newId,
        v.name.trim(),
        Number(v.price),
        v.is_available !== false,
        i,
      ]);
      await client.query(
        `INSERT INTO menu_item_variants (menu_item_id, name, price, is_available, display_order) VALUES ${values}`,
        params
      );
    }

    await client.query('COMMIT');

    const enriched = await _getEnrichedItem(newId);
    emitMenuUpdate(enriched);
    res.status(201).json(enriched);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── PUT /api/menu/:id ────────────────────────────────────────────────────────
// Staff: full update — replaces ingredient list if provided
async function updateMenuItem(req, res, next) {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { name, price, description, category_id, is_available, image_url, image_public_id, ingredients, variants } = req.body;

    const existing = await db.query('SELECT id, category_id FROM menu_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Menu item not found.' });
    const currentCategoryId = existing.rows[0].category_id;

    if (name !== undefined && !name.trim()) return res.status(400).json({ message: 'Item name cannot be empty.' });
    if (price !== undefined && Number(price) <= 0) return res.status(400).json({ message: 'Price must be greater than zero.' });

    const isGroupMode = req.body.variants_mode === 'group' || _isGroupVariantPayload(variants);
    let validatedOptions = [];
    if (variants !== undefined) {
      const effectiveCategoryId = category_id !== undefined ? category_id : currentCategoryId;
      if (isGroupMode) {
        if (variants.length > 0) {
          const v = await _validateGroupVariants(client, effectiveCategoryId, variants);
          if (v.error) return res.status(400).json({ message: v.error });
          validatedOptions = v.options;
        }
      } else {
        const variantErr = _validateVariants(variants);
        if (variantErr) return res.status(400).json({ message: variantErr });

        if (variants.some((v) => v.id != null)) {
          const owned = await db.query('SELECT id FROM menu_item_variants WHERE menu_item_id = $1', [id]);
          const ownedIds = new Set(owned.rows.map((r) => r.id));
          if (variants.some((v) => v.id != null && !ownedIds.has(v.id))) {
            return res.status(400).json({ message: 'A variant does not belong to this menu item.' });
          }
        }
      }
    }

    await client.query('BEGIN');

    // Dynamic SET clause — only update provided fields
    const sets = [];
    const params = [];
    let n = 1;
    if (name            !== undefined) { sets.push(`name = $${n++}`);             params.push(name.trim()); }
    if (price           !== undefined) { sets.push(`price = $${n++}`);            params.push(Number(price)); }
    if (description     !== undefined) { sets.push(`description = $${n++}`);      params.push(description); }
    if (category_id     !== undefined) { sets.push(`category_id = $${n++}`);      params.push(category_id); }
    if (is_available    !== undefined) { sets.push(`is_available = $${n++}`);     params.push(is_available); }
    if (image_url       !== undefined) { sets.push(`image_url = $${n++}`);        params.push(image_url); }
    if (image_public_id !== undefined) { sets.push(`image_public_id = $${n++}`);  params.push(image_public_id); }

    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(id);
      await client.query(`UPDATE menu_items SET ${sets.join(', ')} WHERE id = $${n}`, params);
    }

    // If category changed without an explicit variants payload, remove grouped
    // rows whose group is not linked to the new category.
    if (category_id !== undefined && category_id !== currentCategoryId && variants === undefined) {
      await client.query(
        `DELETE FROM menu_item_variants miv
          WHERE miv.menu_item_id = $1
            AND miv.variant_group_id IS NOT NULL
            AND miv.variant_group_id NOT IN (
              SELECT variant_group_id FROM menu_category_variant_groups WHERE category_id = $2
            )`,
        [id, category_id]
      );
    }

    // Replace ingredients if provided (delete-then-insert)
    if (ingredients !== undefined) {
      await client.query('DELETE FROM menu_item_ingredients WHERE menu_item_id = $1', [id]);
      if (ingredients.length > 0) {
        const values = ingredients.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
        const params2 = ingredients.flatMap((ing) => [
          id,
          ing.inventory_item_id,
          ing.quantity_required != null && Number(ing.quantity_required) > 0 ? Number(ing.quantity_required) : null,
        ]);
        await client.query(
          `INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required) VALUES ${values}`,
          params2
        );
      }
    }

    if (variants !== undefined && isGroupMode) {
      // Group mode: fully replace this item's grouped rows (order history keeps
      // its variant_name snapshot; its variant_id is nulled via ON DELETE SET NULL).
      await client.query(
        `DELETE FROM menu_item_variants
          WHERE menu_item_id = $1 AND variant_group_id IS NOT NULL`,
        [id]
      );
      for (let i = 0; i < validatedOptions.length; i++) {
        const o = validatedOptions[i];
        await client.query(
          `INSERT INTO menu_item_variants (menu_item_id, name, price, is_available, display_order, variant_group_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, o.name, o.price, true, i, o.group_id]
        );
      }
    } else if (variants !== undefined) {
      // Legacy mode: diff by id, restricted to grouped-free rows only.
      const keep = variants.filter((v) => v.id != null).map((v) => v.id);
      await client.query(
        `DELETE FROM menu_item_variants WHERE menu_item_id = $1 AND variant_group_id IS NULL AND NOT (id = ANY($2::int[]))`,
        [id, keep]
      );
      let order = 0;
      for (const v of variants) {
        const vName = v.name.trim();
        const available = typeof v.is_available === 'boolean' ? v.is_available : null;
        if (v.id != null) {
          await client.query(
            `UPDATE menu_item_variants
             SET name = $1, price = $2, is_available = COALESCE($3, is_available), display_order = $4
             WHERE id = $5`,
            [vName, Number(v.price), available, order, v.id]
          );
        } else {
          await client.query(
            `INSERT INTO menu_item_variants (menu_item_id, name, price, is_available, display_order)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, vName, Number(v.price), available === false ? false : true, order]
          );
        }
        order++;
      }
    }

    await client.query('COMMIT');

    const enriched = await _getEnrichedItem(id);
    emitMenuUpdate(enriched);
    res.json(enriched);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── PATCH /api/menu/:id/availability ────────────────────────────────────────
// Staff: manual availability toggle.
// Blocked from toggling ON if any linked ingredient has current_stock = 0.
async function setAvailability(req, res, next) {
  try {
    const { id } = req.params;
    const { is_available } = req.body;

    if (is_available === undefined || typeof is_available !== 'boolean') {
      return res.status(400).json({ message: 'is_available (boolean) is required.' });
    }

    // If trying to set available, check for out-of-stock linked ingredients
    if (is_available) {
      const blockers = await db.query(
        `SELECT inv.name
         FROM menu_item_ingredients mii
         JOIN inventory_items inv ON inv.id = mii.inventory_item_id
         WHERE mii.menu_item_id = $1 AND inv.current_stock <= 0`,
        [id]
      );
      if (blockers.rows.length > 0) {
        const names = blockers.rows.map((r) => r.name).join(', ');
        return res.status(409).json({
          message: `Cannot mark as available — the following ingredients are out of stock: ${names}.`,
          out_of_stock_ingredients: blockers.rows.map((r) => r.name),
        });
      }
    }

    const result = await db.query(
      `UPDATE menu_items SET is_available = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, is_available`,
      [is_available, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Menu item not found.' });

    emitMenuUpdate(result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/menu/:id ─────────────────────────────────────────────────────
// Staff: soft-delete — sets is_deleted = TRUE instead of hard DELETE.
// Cannot hard-delete because order_items.menu_item_id references this table,
// and order history must be preserved.
async function deleteMenuItem(req, res, next) {
  try {
    const result = await db.query(
      `UPDATE menu_items
       SET is_deleted   = TRUE,
           is_available = FALSE,
           deleted_at   = NOW()
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id, name, image_public_id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    // Clean up Cloudinary image (non-blocking — deletion failure shouldn't break the response)
    const { image_public_id } = result.rows[0];
    if (image_public_id) {
      const { cloudinary } = require('../../config/cloudinary');
      cloudinary.uploader.destroy(image_public_id).catch((err) => {
        console.error('[cloudinary] Failed to delete image on item delete:', err.message);
      });
    }

    if (_io) _io.emit('menu_item_deleted', { id: result.rows[0].id });
    res.json({ message: 'Menu item removed.', deleted: { id: result.rows[0].id, name: result.rows[0].name } });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/menu/categories ─────────────────────────────────────────────────
async function getCategories(req, res, next) {
  try {
    const result = await db.query('SELECT id, name FROM menu_categories ORDER BY name ASC');
    res.json({ categories: result.rows });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/menu/categories ────────────────────────────────────────────────
async function createCategory(req, res, next) {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Category name is required.' });

    const result = await db.query(
      'INSERT INTO menu_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *',
      [name.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'A category with that name already exists.' });
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/menu/categories/:id ─────────────────────────────────────────
// Blocked if any items still use this category
async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const inUse = await db.query('SELECT COUNT(*) FROM menu_items WHERE category_id = $1', [id]);
    if (parseInt(inUse.rows[0].count, 10) > 0) {
      return res.status(409).json({
        message: 'Cannot delete a category that still has menu items. Reassign or remove the items first.',
      });
    }
    const result = await db.query('DELETE FROM menu_categories WHERE id = $1 RETURNING id, name', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Category not found.' });
    res.json({ message: 'Category deleted.', deleted: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  setIO,
  getPublicMenu,
  getStaffMenu,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  setAvailability,
  getCategories,
  createCategory,
  deleteCategory,
};