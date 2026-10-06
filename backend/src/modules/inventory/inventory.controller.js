const db = require('../../config/db');
const socketHub = require('../../sockets');
const menuController = require('../menu/menu.controller');
const { lengthCap, numInRange } = require('../../lib/validators');

/**
 * Announce a menu availability change caused by an inventory cascade (an
 * ingredient hitting zero, or a restock making its items sellable again).
 *
 * Fire-and-forget on purpose: it runs after COMMIT, so the write has already
 * succeeded and a failed broadcast must not turn a 200 into a 500. Clients
 * reconcile on their next poll or manual refresh.
 */
function broadcastMenuAvailability(rows) {
  menuController
    .emitAvailabilityUpdates((rows || []).map((r) => r.id))
    .catch((err) => console.error('[inventory] menu availability broadcast failed:', err.message));
}

// ─── Category helpers ─────────────────────────────────────────────────────────
// Normalise a category_ids payload into a clean array of positive integers,
// deduplicated. Anything unparseable, non-integer or non-positive is rejected
// rather than silently dropped, so a typo in the payload cannot quietly leave an
// ingredient in a state the caller did not ask for.
//
// An absent field yields null ("not mentioned"), which is different from [] ("no
// categories"). updateItem needs that distinction; an empty array is a real
// request to strip every tag.
function parseCategoryIds(raw) {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) throw Object.assign(new Error('category_ids must be an array.'), { status: 400 });
  if (raw.length > 50) throw Object.assign(new Error('category_ids is limited to 50 entries.'), { status: 400 });

  const ids = [];
  for (const value of raw) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      throw Object.assign(new Error('Category must be a valid menu category.'), { status: 400 });
    }
    if (!ids.includes(n)) ids.push(n);
  }
  return ids;
}

// Confirm every id names a real menu category, in one round trip. Returns the
// id -> name map so the caller can respond without querying again.
async function loadCategories(ids, res) {
  if (ids.length === 0) return new Map();

  const result = await db.query('SELECT id, name FROM menu_categories WHERE id = ANY($1)', [ids]);
  if (result.rows.length !== ids.length) {
    res.status(400).json({ message: 'Category must be a valid menu category.' });
    return null;
  }
  return new Map(result.rows.map((r) => [Number(r.id), r.name]));
}

// Replace an ingredient's full set of category links. Delete-then-insert inside
// the caller's transaction, so a failure part-way leaves the old set intact.
async function replaceCategoryLinks(client, ingredientId, ids) {
  await client.query('DELETE FROM inventory_item_categories WHERE inventory_item_id = $1', [ingredientId]);
  if (ids.length === 0) return;
  await client.query(
    `INSERT INTO inventory_item_categories (inventory_item_id, menu_category_id)
     SELECT $1, unnest($2::int[])`,
    [ingredientId, ids]
  );
}

// The shape the client consumes: ids sorted for comparison, names sorted for
// display. Both already alphabetical from the query, kept parallel by position.
function categoryPayload(ids, nameById) {
  const pairs = ids
    .map((id) => ({ id: Number(id), name: nameById.get(Number(id)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    category_ids: pairs.map((p) => p.id),
    category_names: pairs.map((p) => p.name),
  };
}

// ─── GET /api/inventory ───────────────────────────────────────────────────────
// Staff: all inventory items with low-stock flag
async function getAll(req, res, next) {
  try {
    // Categories come back as two parallel arrays rather than a joined string:
    // the filter matches on ids, the display joins the names. Ordered by name so
    // the rendered order is stable regardless of insertion order.
    const result = await db.query(`
      SELECT
        i.id,
        i.name,
        i.unit,
        i.current_stock,
        i.reorder_level,
        i.updated_at,
        (i.current_stock <= i.reorder_level) AS is_low_stock,
        COALESCE(cat.ids, '{}')   AS category_ids,
        COALESCE(cat.names, '{}') AS category_names
      FROM inventory_items i
      LEFT JOIN LATERAL (
        SELECT
          array_agg(c.id ORDER BY c.name)   AS ids,
          array_agg(c.name ORDER BY c.name) AS names
        FROM inventory_item_categories iic
        JOIN menu_categories c ON c.id = iic.menu_category_id
        WHERE iic.inventory_item_id = i.id
      ) cat ON TRUE
      ORDER BY i.name ASC
    `);

    res.json({
      items: result.rows.map((r) => ({
        ...r,
        category_ids: r.category_ids.map(Number),
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
      `SELECT i.id, i.name, i.unit, i.current_stock, i.reorder_level, i.updated_at,
              (i.current_stock <= i.reorder_level) AS is_low_stock,
              COALESCE(cat.ids, '{}')   AS category_ids,
              COALESCE(cat.names, '{}') AS category_names
       FROM inventory_items i
       LEFT JOIN LATERAL (
         SELECT
           array_agg(c.id ORDER BY c.name)   AS ids,
           array_agg(c.name ORDER BY c.name) AS names
         FROM inventory_item_categories iic
         JOIN menu_categories c ON c.id = iic.menu_category_id
         WHERE iic.inventory_item_id = i.id
       ) cat ON TRUE
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Inventory item not found.' });
    }
    const r = result.rows[0];
    res.json({
      ...r,
      category_ids: r.category_ids.map(Number),
      current_stock: parseFloat(r.current_stock),
      reorder_level: parseFloat(r.reorder_level),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/inventory ──────────────────────────────────────────────────────
// Staff: create a new ingredient
// Body: { name, unit, current_stock?, reorder_level?, category_ids? }
//
// category_ids may hold any number of menu category ids, including none. An
// ingredient shared between two menu categories is tagged with both, so it
// turns up under either one in the inventory filter.
async function createItem(req, res, next) {
  // One transaction: the INSERT and its category links either both land or
  // neither does, so an ingredient can never exist with a partial tag set.
  const client = await db.getClient();
  try {
    const { name, unit, current_stock = 0, reorder_level = 0 } = req.body;

    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Ingredient name is required.' });
    if (typeof unit !== 'string' || !unit.trim()) return res.status(400).json({ message: 'Unit is required (e.g. kg, pcs, liters).' });
    const nameErr = lengthCap(name, 'Ingredient name', 50);
    if (nameErr) return res.status(400).json({ message: nameErr });
    const unitErr = lengthCap(unit, 'Unit', 20);
    if (unitErr) return res.status(400).json({ message: unitErr });
    const stockErr = numInRange(current_stock, 'Current stock', { min: 0 });
    if (stockErr) return res.status(400).json({ message: stockErr });
    const reorderErr = numInRange(reorder_level, 'Reorder level', { min: 0 });
    if (reorderErr) return res.status(400).json({ message: reorderErr });

    const categoryIds = parseCategoryIds(req.body.category_ids) ?? [];
    const nameById = await loadCategories(categoryIds, res);
    if (nameById === null) return;

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO inventory_items (name, unit, current_stock, reorder_level)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, unit, current_stock, reorder_level, updated_at`,
      [name.trim(), unit.trim(), Number(current_stock), Number(reorder_level)]
    );

    const r = result.rows[0];
    await replaceCategoryLinks(client, r.id, categoryIds);

    await client.query('COMMIT');

    res.status(201).json({
      ...r,
      ...categoryPayload(categoryIds, nameById),
      current_stock: parseFloat(r.current_stock),
      reorder_level: parseFloat(r.reorder_level),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'An ingredient with that name already exists.' });
    }
    if (err.status === 400) return res.status(400).json({ message: err.message });
    next(err);
  } finally {
    client.release();
  }
}

// ─── PATCH /api/inventory/:id ─────────────────────────────────────────────────
// Staff: edit an ingredient's details (name, unit, category).
//
// Deliberately narrow. It does not touch current_stock or reorder_level: stock
// only ever moves through a logged transaction, so allowing an edit here would
// create a second, silent path into the number that the whole low-stock cascade
// and the audit trail depend on.
//
// That restraint is also why a unit change is a relabelling and nothing more.
// current_stock is stored as a bare number, so switching an ingredient from
// 'pcs' to 'kilogram' does not convert 500 pcs into a weight - 500 simply starts
// meaning kilograms. The client warns before saving; converting the quantity is
// left to a deliberate adjustment, which is logged.
//
// Safe to rename. menu_item_ingredients joins on inventory_item_id, so recipe
// links and menu availability follow the rename automatically.
async function updateItem(req, res, next) {
  // Transactional, because a category change is a delete-then-insert over the
  // join table. Without one, a failure between the two would leave the
  // ingredient with some of its old tags and none of the new ones.
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const updates = {};

    if (req.body.name !== undefined) {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) return res.status(400).json({ message: 'Ingredient name is required.' });
      const nameErr = lengthCap(name, 'Ingredient name', 50);
      if (nameErr) return res.status(400).json({ message: nameErr });
      updates.name = name;
    }

    if (req.body.unit !== undefined) {
      const unit = typeof req.body.unit === 'string' ? req.body.unit.trim() : '';
      if (!unit) return res.status(400).json({ message: 'Unit is required (e.g. kg, pcs, liters).' });
      const unitErr = lengthCap(unit, 'Unit', 20);
      if (unitErr) return res.status(400).json({ message: unitErr });
      updates.unit = unit;
    }

    // null means "leave the tags alone", [] means "strip every tag". Both are
    // legitimate: a rename should not silently recategorise the ingredient.
    const categoryIds = parseCategoryIds(req.body.category_ids);
    let nameById = null;
    if (categoryIds !== null) {
      nameById = await loadCategories(categoryIds, res);
      if (nameById === null) return;
    }

    // The SET list is built from the fields actually present. COALESCE cannot be
    // used here: it cannot tell an omitted field from one explicitly set to
    // null. Column names are literals from this whitelist; every value is still
    // a bound parameter.
    const sets = [];
    const params = [id];
    for (const [col, val] of [
      ['name', updates.name],
      ['unit', updates.unit],
    ]) {
      if (val === undefined) continue;
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }

    if (sets.length === 0 && categoryIds === null) {
      return res.status(400).json({ message: 'Nothing to update.' });
    }

    await client.query('BEGIN');

    if (sets.length > 0) {
      sets.push('updated_at = NOW()');
      const result = await client.query(
        `UPDATE inventory_items
            SET ${sets.join(', ')}
          WHERE id = $1
          RETURNING id, name, unit, current_stock, reorder_level, updated_at`,
        params
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Inventory item not found.' });
      }
      updates.row = result.rows[0];
    } else {
      // Category-only edit still has to confirm the ingredient exists.
      const existing = await client.query(
        'SELECT id, name, unit, current_stock, reorder_level, updated_at FROM inventory_items WHERE id = $1',
        [id]
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Inventory item not found.' });
      }
      updates.row = existing.rows[0];
    }

    if (categoryIds !== null) {
      await replaceCategoryLinks(client, Number(id), categoryIds);
    }

    // Report the tags the row actually ends up with: the requested set when one
    // was sent, otherwise re-read whatever is there now.
    const finalIds = categoryIds !== null
      ? categoryIds
      : (await client.query(
          `SELECT menu_category_id FROM inventory_item_categories
            WHERE inventory_item_id = $1 ORDER BY menu_category_id`, [id]
        )).rows.map((r) => Number(r.menu_category_id));

    const finalNames = nameById !== null && categoryIds !== null
      ? nameById
      : await loadCategories(finalIds, res);
    if (finalNames === null) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query('COMMIT');

    const r = updates.row;
    socketHub.emitInventoryUpdate({ itemId: Number(id), id: Number(id) });

    res.json({
      ...r,
      ...categoryPayload(finalIds, finalNames),
      current_stock: parseFloat(r.current_stock),
      reorder_level: parseFloat(r.reorder_level),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status === 400) return res.status(400).json({ message: err.message });
    if (err.code === '23505') {
      return res.status(409).json({ message: 'An ingredient with that name already exists.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ message: 'Category must be a valid menu category.' });
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
    const qtyErr = numInRange(quantity, 'Quantity', { min: 0, exclusive: true });
    if (qtyErr) {
      return res.status(400).json({ message: qtyErr });
    }
    // Restocks are capped small: large adds are adjustments, not deliveries.
    if (change_type === 'restock' && Number(quantity) > 200) {
      return res.status(400).json({ message: 'Restock quantity must not exceed 200.' });
    }

    await client.query('BEGIN');

    // Row-level lock so concurrent transactions don't race
    const itemRes = await client.query(
      'SELECT id, name, current_stock, reorder_level FROM inventory_items WHERE id = $1 FOR UPDATE',
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

    socketHub.emitInventoryUpdate({
      itemId: Number(id),
      currentStock: newStock,
      reorderLevel: Number(item.reorder_level),
    });
    broadcastMenuAvailability(autoEnabled);

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
      'SELECT id, name, current_stock, reorder_level FROM inventory_items WHERE id = $1 FOR UPDATE',
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

    socketHub.emitInventoryUpdate({
      itemId: Number(id),
      currentStock: 0,
      reorderLevel: Number(itemRes.rows[0].reorder_level),
    });
    broadcastMenuAvailability(cascadeRes.rows);

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

// ─── DELETE /api/inventory/:id ────────────────────────────────────────────────
// Staff: remove an ingredient outright.
//
// This is a hard delete. Both children cascade:
//   menu_item_ingredients  - the recipe links vanish
//   inventory_transactions  - the movement history is erased too
//
// The erased history is the part worth knowing about, so the response names
// every menu item that loses a recipe link. That is the caller's only warning
// before the audit trail is gone.
async function deleteItem(req, res, next) {
  const client = await db.getClient();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const itemRes = await client.query(
      'SELECT id, name, current_stock FROM inventory_items WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (itemRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Inventory item not found.' });
    }

    // Capture the linked menu items *before* the delete - once the rows cascade
    // there is nothing left to join against.
    const linked = await client.query(
      `SELECT m.id, m.name, m.is_available
         FROM menu_items m
         JOIN menu_item_ingredients mi ON mi.menu_item_id = m.id
        WHERE mi.inventory_item_id = $1
        ORDER BY m.name`,
      [id]
    );

    // Count the history that is about to cascade away, so the caller can report it.
    const txnRes = await client.query(
      'SELECT count(*)::int AS n FROM inventory_transactions WHERE inventory_item_id = $1',
      [id]
    );

    const del = await client.query(
      'DELETE FROM inventory_items WHERE id = $1 RETURNING id',
      [id]
    );
    if (del.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Inventory item not found.' });
    }

    await client.query('COMMIT');

    // No availability broadcast: menu_items.is_available is a stored flag, and
    // dropping an ingredient link does not change it. Clients refresh instead.
    socketHub.emitInventoryUpdate({ id: Number(id), deleted: true });

    res.json({
      id: Number(id),
      name: itemRes.rows[0].name,
      unlinked_menu_items: linked.rows,
      transactions_erased: txnRes.rows[0].n,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    // FK violation (23503) → the item still has history or other references.
    if (err.code === '23503') {
      return res.status(409).json({ message: 'Cannot delete: item is still referenced by inventory history or other records.' });
    }
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

module.exports = { getAll, getById, createItem, updateItem, createTransaction, outOfStock, deleteItem, getTransactions };