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

    await client.query('COMMIT');

    res.json({
      id: Number(id),
      name: item.name,
      current_stock: newStock,
      change_type,
      quantity: Number(quantity),
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

module.exports = { getAll, getById, createItem, createTransaction, getTransactions };