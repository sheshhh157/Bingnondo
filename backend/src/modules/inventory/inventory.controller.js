const db = require('../../config/db');

// ─── GET /api/inventory ───────────────────────────────────────────────────────
// Staff: all inventory items with low-stock flag
async function getAll(req, res, next) {
  try {
    const result = await db.query(`
      SELECT
        id,
        name,
        unit,
        current_stock,
        reorder_level,
        updated_at,
        (current_stock <= reorder_level) AS is_low_stock
      FROM inventory_items
      ORDER BY name ASC
    `);

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
      `SELECT id, name, unit, current_stock, reorder_level, updated_at,
              (current_stock <= reorder_level) AS is_low_stock
       FROM inventory_items WHERE id = $1`,
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
// Staff: create a new ingredient
// Body: { name, unit, current_stock?, reorder_level? }
async function createItem(req, res, next) {
  try {
    const { name, unit, current_stock = 0, reorder_level = 0 } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Ingredient name is required.' });
    if (!unit?.trim()) return res.status(400).json({ message: 'Unit is required (e.g. kg, pcs, liters).' });

    const result = await db.query(
      `INSERT INTO inventory_items (name, unit, current_stock, reorder_level)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), unit.trim(), Number(current_stock), Number(reorder_level)]
    );

    const r = result.rows[0];
    res.status(201).json({
      ...r,
      current_stock: parseFloat(r.current_stock),
      reorder_level: parseFloat(r.reorder_level),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'An ingredient with that name already exists.' });
    }
    next(err);
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
    if (!quantity || Number(quantity) <= 0) {
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

    if (change_type === 'restock')     newStock += Number(quantity);
    else if (change_type === 'deduction') newStock = Math.max(0, newStock - Number(quantity));
    else if (change_type === 'adjustment') newStock = Number(quantity);

    await client.query(
      'UPDATE inventory_items SET current_stock = $1, updated_at = NOW() WHERE id = $2',
      [newStock, id]
    );

    await client.query(
      `INSERT INTO inventory_transactions (inventory_item_id, change_type, quantity, performed_by)
       VALUES ($1, $2, $3, $4)`,
      [id, change_type, Number(quantity), req.user?.sub || null]
    );

    // Auto-cascade: if this restock brought the ingredient above 0,
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
      quantity: Number(quantity),
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

module.exports = { getAll, getById, createItem, createTransaction, outOfStock, getTransactions };