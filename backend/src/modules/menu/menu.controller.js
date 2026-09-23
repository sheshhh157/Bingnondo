const db = require('../../config/db');

// ─── Socket.io injection ──────────────────────────────────────────────────────
let _io = null;
function setIO(io) { _io = io; }

function emitMenuUpdate(item) {
  if (_io) _io.emit('menu_update', item);
}

// ─── Internal helper: fetch one item enriched with category + ingredients ─────
async function _getEnrichedItem(id) {
  const [itemRes, ingRes] = await Promise.all([
    db.query(
      `SELECT
         mi.id,
         mi.category_id,
         mc.name  AS category_name,
         mi.name,
         mi.description,
         mi.price,
         mi.image_url,
         mi.is_available,
         mi.created_at,
         mi.updated_at
       FROM menu_items mi
       JOIN menu_categories mc ON mc.id = mi.category_id
       WHERE mi.id = $1`,
      [id]
    ),
    db.query(
      `SELECT
         mii.inventory_item_id,
         mii.quantity_required,
         inv.name,
         inv.unit
       FROM menu_item_ingredients mii
       JOIN inventory_items inv ON inv.id = mii.inventory_item_id
       WHERE mii.menu_item_id = $1
       ORDER BY inv.name ASC`,
      [id]
    ),
  ]);

  if (itemRes.rows.length === 0) return null;

  const item = itemRes.rows[0];
  return {
    ...item,
    price: parseFloat(item.price),
    ingredients: ingRes.rows.map((r) => ({
      inventory_item_id: r.inventory_item_id,
      quantity_required: parseFloat(r.quantity_required),
      name: r.name,
      unit: r.unit,
    })),
  };
}

// ─── GET /api/menu ────────────────────────────────────────────────────────────
// Public — customers + cashier read-only view (no ingredients)
async function getPublicMenu(req, res, next) {
  try {
    const [catRes, itemRes] = await Promise.all([
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
        ORDER BY mc.name ASC, mi.name ASC
      `),
    ]);

    res.json({
      categories: catRes.rows,
      items: itemRes.rows.map((r) => ({ ...r, price: parseFloat(r.price) })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/menu/staff ──────────────────────────────────────────────────────
// Staff view — enriched with linked ingredients per item
async function getStaffMenu(req, res, next) {
  try {
    const [catRes, itemRes, ingRes] = await Promise.all([
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
          mi.is_available,
          mi.created_at,
          mi.updated_at
        FROM menu_items mi
        JOIN menu_categories mc ON mc.id = mi.category_id
        ORDER BY mc.name ASC, mi.name ASC
      `),
      db.query(`
        SELECT
          mii.menu_item_id,
          mii.inventory_item_id,
          mii.quantity_required,
          inv.name,
          inv.unit
        FROM menu_item_ingredients mii
        JOIN inventory_items inv ON inv.id = mii.inventory_item_id
        ORDER BY inv.name ASC
      `),
    ]);

    // Group ingredients by menu_item_id
    const ingMap = {};
    for (const row of ingRes.rows) {
      if (!ingMap[row.menu_item_id]) ingMap[row.menu_item_id] = [];
      ingMap[row.menu_item_id].push({
        inventory_item_id: row.inventory_item_id,
        quantity_required: parseFloat(row.quantity_required),
        name: row.name,
        unit: row.unit,
      });
    }

    res.json({
      categories: catRes.rows,
      items: itemRes.rows.map((item) => ({
        ...item,
        price: parseFloat(item.price),
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
      description = null,
      category_id,
      is_available = true,
      image_url = null,
      ingredients = [],
    } = req.body;

    if (!name?.trim())            return res.status(400).json({ message: 'Item name is required.' });
    if (!price || Number(price) <= 0) return res.status(400).json({ message: 'A valid price is required.' });
    if (!category_id)             return res.status(400).json({ message: 'Category is required.' });

    await client.query('BEGIN');

    const itemRes = await client.query(
      `INSERT INTO menu_items (category_id, name, description, price, image_url, is_available)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [category_id, name.trim(), description, Number(price), image_url, is_available]
    );
    const newId = itemRes.rows[0].id;

    if (ingredients.length > 0) {
      const values = ingredients.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
      const params = ingredients.flatMap((ing) => [newId, ing.inventory_item_id, ing.quantity_required]);
      await client.query(
        `INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required) VALUES ${values}`,
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
    const { name, price, description, category_id, is_available, image_url, ingredients } = req.body;

    const existing = await db.query('SELECT id FROM menu_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Menu item not found.' });

    if (name !== undefined && !name.trim()) return res.status(400).json({ message: 'Item name cannot be empty.' });
    if (price !== undefined && Number(price) <= 0) return res.status(400).json({ message: 'Price must be greater than zero.' });

    await client.query('BEGIN');

    // Dynamic SET clause — only update provided fields
    const sets = [];
    const params = [];
    let n = 1;
    if (name        !== undefined) { sets.push(`name = $${n++}`);         params.push(name.trim()); }
    if (price       !== undefined) { sets.push(`price = $${n++}`);        params.push(Number(price)); }
    if (description !== undefined) { sets.push(`description = $${n++}`);  params.push(description); }
    if (category_id !== undefined) { sets.push(`category_id = $${n++}`);  params.push(category_id); }
    if (is_available!== undefined) { sets.push(`is_available = $${n++}`); params.push(is_available); }
    if (image_url   !== undefined) { sets.push(`image_url = $${n++}`);    params.push(image_url); }

    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(id);
      await client.query(`UPDATE menu_items SET ${sets.join(', ')} WHERE id = $${n}`, params);
    }

    // Replace ingredients if provided (delete-then-insert)
    if (ingredients !== undefined) {
      await client.query('DELETE FROM menu_item_ingredients WHERE menu_item_id = $1', [id]);
      if (ingredients.length > 0) {
        const values = ingredients.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
        const params2 = ingredients.flatMap((ing) => [id, ing.inventory_item_id, ing.quantity_required]);
        await client.query(
          `INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required) VALUES ${values}`,
          params2
        );
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
// Staff: manual availability toggle — independent of stock
async function setAvailability(req, res, next) {
  try {
    const { id } = req.params;
    const { is_available } = req.body;

    if (is_available === undefined || typeof is_available !== 'boolean') {
      return res.status(400).json({ message: 'is_available (boolean) is required.' });
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
// Staff: remove an item (cascade deletes ingredient links via FK)
async function deleteMenuItem(req, res, next) {
  try {
    const result = await db.query(
      'DELETE FROM menu_items WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Menu item not found.' });

    if (_io) _io.emit('menu_item_deleted', { id: result.rows[0].id });
    res.json({ message: 'Menu item removed.', deleted: result.rows[0] });
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