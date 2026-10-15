const db = require('../../config/db');

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function writeAuditLog(client, actorId, action, targetType, targetId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, targetType, targetId, JSON.stringify(details)]
  );
}

// Normalizes an optional list of category ids into a deduped array of positive
// integers. Returns { ids, invalid } — `invalid` is true when any entry is not
// a positive integer (blanks are simply skipped).
function normalizeCategoryIds(value) {
  if (value === null || value === undefined) return { ids: [], invalid: false };
  const arr = Array.isArray(value) ? value : [value];
  const ids = [];
  for (const v of arr) {
    if (v === null || v === '' || v === undefined) continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return { ids: [], invalid: true };
    if (!ids.includes(n)) ids.push(n);
  }
  return { ids, invalid: false };
}

// Inserts the (item, category) pairs for an inventory item.
async function linkCategories(client, itemId, categoryIds) {
  if (categoryIds.length === 0) return;
  const values = categoryIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO inventory_item_categories (inventory_item_id, category_id) VALUES ${values}`,
    [Number(itemId), ...categoryIds]
  );
}

// ─── GET /api/inventory ───────────────────────────────────────────────────────
// Staff: all inventory items with low-stock flag
async function getAll(req, res, next) {
  try {
    const result = await db.query(
      `SELECT
         i.id,
         i.name,
         i.unit,
         i.current_stock,
         i.reorder_level,
         i.updated_at,
         (i.current_stock <= i.reorder_level) AS is_low_stock,
         COALESCE(
           json_agg(
             json_build_object('id', mc.id, 'name', mc.name)
             ORDER BY mc.name
           ) FILTER (WHERE mc.id IS NOT NULL),
           '[]'
         ) AS categories
       FROM inventory_items i
       LEFT JOIN inventory_item_categories iic ON iic.inventory_item_id = i.id
       LEFT JOIN menu_categories mc ON mc.id = iic.category_id
       GROUP BY i.id
       ORDER BY i.name`
    );
    res.json({
      items: result.rows.map((r) => ({
        ...r,
        current_stock: parseFloat(r.current_stock),
        reorder_level: parseFloat(r.reorder_level),
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/inventory/:id ───────────────────────────────────────────────────
async function getById(req, res, next) {
  try {
    const result = await db.query(
      `SELECT
         i.id,
         i.name,
         i.unit,
         i.current_stock,
         i.reorder_level,
         i.updated_at,
         COALESCE(
           json_agg(
             json_build_object('id', mc.id, 'name', mc.name)
             ORDER BY mc.name
           ) FILTER (WHERE mc.id IS NOT NULL),
           '[]'
         ) AS categories
       FROM inventory_items i
       LEFT JOIN inventory_item_categories iic ON iic.inventory_item_id = i.id
       LEFT JOIN menu_categories mc ON mc.id = iic.category_id
       WHERE i.id = $1
       GROUP BY i.id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Inventory item not found.' });
    }
    const r = result.rows[0];
    res.json({
      ...r,
      current_stock: parseFloat(r.current_stock),
      reorder_level: parseFloat(r.reorder_level),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/inventory ──────────────────────────────────────────────────────
// Admin: create a new ingredient
// Body: { name, unit, current_stock?, reorder_level?, category_ids? }
async function createItem(req, res, next) {
  const client = await db.getClient();
  try {
    const { name, unit, current_stock = 0, reorder_level = 0, category_ids = [] } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Ingredient name is required.' });
    if (!unit?.trim()) return res.status(400).json({ message: 'Unit is required (e.g. kg, pcs, liters).' });

    const { ids: catIds, invalid } = normalizeCategoryIds(category_ids);
    if (invalid) return res.status(400).json({ message: 'Invalid category selection.' });

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO inventory_items (name, unit, current_stock, reorder_level)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), unit.trim(), Number(current_stock), Number(reorder_level)]
    );
    const r = result.rows[0];

    await linkCategories(client, r.id, catIds);

    await writeAuditLog(client, req.user?.sub || null, 'create_inventory_item', 'inventory_items', r.id, {
      name: r.name,
      unit: r.unit,
      category_ids: catIds,
    });

    await client.query('COMMIT');

    res.status(201).json({
      ...r,
      current_stock: parseFloat(r.current_stock),
      reorder_level: parseFloat(r.reorder_level),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'An ingredient with that name already exists.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ message: 'One of those categories no longer exists.' });
    }
    next(err);
  } finally {
    client.release();
  }
}

// ─── PUT /api/inventory/:id ───────────────────────────────────────────────────
// Admin: edit an ingredient's details (name, unit, reorder level, categories)
// and set its current stock directly. (Cashiers correct stock via the dedicated
// adjustment transaction instead.)
// Body: { name, unit, current_stock?, reorder_level?, category_ids? }
async function updateItem(req, res, next) {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { name, unit, current_stock, reorder_level = 0, category_ids = [] } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Ingredient name is required.' });
    if (!unit?.trim()) return res.status(400).json({ message: 'Unit is required (e.g. kg, pcs, liters).' });

    const { ids: catIds, invalid } = normalizeCategoryIds(category_ids);
    if (invalid) return res.status(400).json({ message: 'Invalid category selection.' });

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id, name, current_stock FROM inventory_items WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Inventory item not found.' });
    }

    // Stock is editable here. If the caller omits current_stock, the existing
    // value is preserved.
    const oldStock = parseFloat(existing.rows[0].current_stock);
    const newStock = current_stock === undefined || current_stock === ''
      ? oldStock
      : Number(current_stock);
    if (!Number.isFinite(newStock) || newStock < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Stock must be a number that is zero or greater.' });
    }

    const result = await client.query(
      `UPDATE inventory_items
       SET name = $1, unit = $2, reorder_level = $3, current_stock = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name.trim(), unit.trim(), Number(reorder_level) || 0, newStock, id]
    );
    const r = result.rows[0];

    // Replace the item's category links with the submitted set.
    await client.query('DELETE FROM inventory_item_categories WHERE inventory_item_id = $1', [id]);
    await linkCategories(client, id, catIds);

    // Keep the movement history complete: log the direct stock correction.
    if (newStock !== oldStock) {
      await client.query(
        `INSERT INTO inventory_transactions (inventory_item_id, change_type, quantity, performed_by)
         VALUES ($1, 'adjustment', $2, $3)`,
        [id, newStock, req.user?.sub || null]
      );
    }

    await writeAuditLog(client, req.user?.sub || null, 'update_inventory_item', 'inventory_items', Number(id), {
      name: r.name,
      unit: r.unit,
      category_ids: catIds,
      old_stock: oldStock,
      new_stock: newStock,
    });

    await client.query('COMMIT');

    res.json({
      ...r,
      current_stock: parseFloat(r.current_stock),
      reorder_level: parseFloat(r.reorder_level),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'An ingredient with that name already exists.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ message: 'One of those categories no longer exists.' });
    }
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/inventory/:id/transaction ─────────────────────────────────────
// Staff: log a stock movement (restock / adjustment / deduction)
// Body: { change_type, quantity, note? }
async function createTransaction(req, res, next) {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { change_type, quantity } = req.body;

    const VALID = ['restock', 'deduction', 'adjustment'];
    if (!VALID.includes(change_type)) {
      return res.status(400).json({ message: `change_type must be one of: ${VALID.join(', ')}.` });
    }
    // An adjustment sets the stock to a counted value, so 0 is valid (a full
    // correction). Restock/deduction move stock by an amount and must be > 0.
    const isAdjustment = change_type === 'adjustment';
    const qty = Number(quantity);
    if (quantity === undefined || quantity === '' || !Number.isFinite(qty) || qty < 0) {
      return res.status(400).json({ message: 'Quantity must be zero or greater.' });
    }
    if (!isAdjustment && qty <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive number.' });
    }

    await client.query('BEGIN');

    // Row-level lock so concurrent transactions don't race
    const itemRes = await client.query(
      'SELECT id, name, current_stock FROM inventory_items WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Inventory item not found.' });
    }

    const item = itemRes.rows[0];
    let newStock = parseFloat(item.current_stock);

    if (change_type === 'restock')     newStock += qty;
    else if (change_type === 'deduction') newStock = Math.max(0, newStock - qty);
    else if (change_type === 'adjustment') newStock = qty;

    await client.query(
      'UPDATE inventory_items SET current_stock = $1, updated_at = NOW() WHERE id = $2',
      [newStock, id]
    );

    await client.query(
      `INSERT INTO inventory_transactions (inventory_item_id, change_type, quantity, performed_by)
       VALUES ($1, $2, $3, $4)`,
      [id, change_type, qty, req.user?.sub || null]
    );

    // Auto-cascade: if this restock/adjustment brought the ingredient above 0,
    // re-enable any menu items where ALL linked ingredients now have stock.
    let autoEnabled = [];
    if (newStock > 0 && (change_type === 'restock' || change_type === 'adjustment')) {
      const cascadeRes = await client.query(
        `UPDATE menu_items
         SET is_available = true, updated_at = NOW()
         WHERE id IN (
           -- Menu items linked to this ingredient
           SELECT mii.menu_item_id
           FROM menu_item_ingredients mii
           WHERE mii.inventory_item_id = $1
         )
         AND id NOT IN (
           -- Exclude those that still have at least one other out-of-stock ingredient
           SELECT mii2.menu_item_id
           FROM menu_item_ingredients mii2
           JOIN inventory_items inv2 ON inv2.id = mii2.inventory_item_id
           WHERE inv2.current_stock <= 0
             AND inv2.id != $1
         )
         AND is_available = false
         RETURNING id, name`,
        [id]
      );
      autoEnabled = cascadeRes.rows;
    }

    await client.query('COMMIT');

    res.json({
      id: Number(id),
      name: item.name,
      current_stock: newStock,
      change_type,
      quantity: qty,
      auto_enabled_menu_items: autoEnabled,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/inventory/:id/out-of-stock ────────────────────────────────────
// Staff: force stock to 0, then cascade is_available = false on all menu items
// that use this ingredient.
async function outOfStock(req, res, next) {
  const client = await db.getClient();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Lock + verify exists
    const itemRes = await client.query(
      'SELECT id, name, current_stock FROM inventory_items WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Inventory item not found.' });
    }

    // Set stock to 0
    await client.query(
      'UPDATE inventory_items SET current_stock = 0, updated_at = NOW() WHERE id = $1',
      [id]
    );

    // Log the transaction
    await client.query(
      `INSERT INTO inventory_transactions (inventory_item_id, change_type, quantity, performed_by)
       VALUES ($1, 'adjustment', $2, $3)`,
      [id, itemRes.rows[0].current_stock, req.user?.sub || null]
    );

    // Cascade: mark linked menu items as unavailable
    const cascadeRes = await client.query(
      `UPDATE menu_items
       SET is_available = false, updated_at = NOW()
       WHERE id IN (
         SELECT menu_item_id FROM menu_item_ingredients WHERE inventory_item_id = $1
       )
       RETURNING id, name`,
      [id]
    );

    await client.query('COMMIT');

    res.json({
      id: Number(id),
      name: itemRes.rows[0].name,
      current_stock: 0,
      affected_menu_items: cascadeRes.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/inventory/:id/transactions ─────────────────────────────────────
// Staff: transaction history for one ingredient (last 100)
async function getTransactions(req, res, next) {
  try {
    const result = await db.query(
      `SELECT
         it.id,
         it.change_type,
         it.quantity,
         it.created_at,
         sa.full_name AS performed_by_name
       FROM inventory_transactions it
       LEFT JOIN staff_accounts sa ON sa.id = it.performed_by
       WHERE it.inventory_item_id = $1
       ORDER BY it.created_at DESC
       LIMIT 100`,
      [req.params.id]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    next(err);
  }
}

// NOTE: Inventory categories come from the shared `menu_categories` table,
// managed in Menu Management. See GET /api/menu/categories.

module.exports = {
  getAll,
  getById,
  createItem,
  updateItem,
  createTransaction,
  outOfStock,
  getTransactions,
};