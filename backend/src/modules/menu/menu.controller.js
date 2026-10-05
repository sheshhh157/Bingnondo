const db = require('../../config/db');

// ─── Socket.io injection ──────────────────────────────────────────────────────
let _io = null;
function setIO(io) { _io = io; }

function emitMenuUpdate(item) {
  if (_io) _io.emit('menu_update', item);
}

/**
 * Broadcast `menu_update` for menu items that some *other* module changed —
 * today the inventory cascade flipping `is_available` when an ingredient runs
 * out. Without this the cashier POS (which listens but never polls) keeps
 * selling items the kitchen can no longer make.
 *
 * The payload is the same enriched shape that create/update emit, not a bare
 * `{ id, is_available }`: listeners that merge the whole object (the staff
 * menu) also get refreshed `ingredients[].current_stock`, which is what drives
 * their out-of-stock hints. Two queries total no matter how many items
 * changed. Call only after the caller's transaction has committed.
 */
async function emitAvailabilityUpdates(ids) {
  if (!_io || !Array.isArray(ids) || ids.length === 0) return [];

  const unique = [...new Set(ids.map(Number).filter(Number.isInteger))];
  if (unique.length === 0) return [];

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
       WHERE mi.id = ANY($1::int[])`,
      [unique]
    ),
    db.query(
      `SELECT
         mii.menu_item_id,
         mii.inventory_item_id,
         mii.quantity_required,
         inv.name,
         inv.unit,
         inv.current_stock
       FROM menu_item_ingredients mii
       JOIN inventory_items inv ON inv.id = mii.inventory_item_id
       WHERE mii.menu_item_id = ANY($1::int[])
       ORDER BY inv.name ASC`,
      [unique]
    ),
  ]);

  const ingredientsByItem = new Map();
  for (const r of ingRes.rows) {
    if (!ingredientsByItem.has(r.menu_item_id)) ingredientsByItem.set(r.menu_item_id, []);
    ingredientsByItem.get(r.menu_item_id).push({
      inventory_item_id: r.inventory_item_id,
      quantity_required: r.quantity_required != null ? parseFloat(r.quantity_required) : null,
      name: r.name,
      unit: r.unit,
      current_stock: parseFloat(r.current_stock),
    });
  }

  const items = itemRes.rows.map((item) => ({
    ...item,
    price: parseFloat(item.price),
    ingredients: ingredientsByItem.get(item.id) || [],
  }));

  for (const item of items) emitMenuUpdate(item);
  return items;
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
  ]);

  if (itemRes.rows.length === 0) return null;

  const item = itemRes.rows[0];
  const byItem = await fetchOptionsForItems([Number(id)]);
  return {
    ...item,
    price: parseFloat(item.price),
    options: byItem.get(Number(id)) || [],
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
         WHERE mi.archived_at IS NULL
         ORDER BY mc.name ASC, mi.name ASC
        `),
    ]);

    res.json({
      categories: catRes.rows,
      items: attachOptions(
        itemRes.rows.map((r) => ({ ...r, price: parseFloat(r.price) })),
        await fetchOptionsForItems(itemRes.rows.map((r) => r.id))
      ),
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
            mi.updated_at,
            mi.archived_at
          FROM menu_items mi
          JOIN menu_categories mc ON mc.id = mi.category_id
         WHERE mi.archived_at IS NULL
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

    res.json({
      categories: catRes.rows,
      items: attachOptions(
        itemRes.rows.map((item) => ({
          ...item,
          price: parseFloat(item.price),
          ingredients: ingMap[item.id] || [],
        })),
        await fetchOptionsForItems(itemRes.rows.map((i) => i.id))
      ),
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
      options = [],
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

    // Options carry their own absolute price, so they are inserted after the
    // item exists and in the same transaction -- a half-created item with no
    // variants is not a state the staff page should ever be able to save.
    // 6 values per row: menu_item_id, name, price, is_available, sort_order, option_kind.
    if (Array.isArray(options) && options.length > 0) {
      const values = options
        .map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`)
        .join(', ');
      const params = options.flatMap((opt, i) => [
        newId,
        String(opt.name || '').trim(),
        Number(opt.price) || 0,
        opt.is_available !== false,
        i,
        opt.option_kind === 'flavor' ? 'flavor' : 'variant',
      ]);
      await client.query(
        `INSERT INTO menu_item_options (menu_item_id, name, price, is_available, sort_order, option_kind)
         VALUES ${values}`,
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
    const { name, price, description, category_id, is_available, image_url, ingredients, options } = req.body;

    const existing = await db.query('SELECT id, price FROM menu_items WHERE id = $1', [id]);
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

    if (price !== undefined && Number(price) !== Number(existing.rows[0].price)) {
      try {
        await client.query('SAVEPOINT sp_audit');
        await client.query(
          `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
           VALUES ($1, 'menu_item_price_changed', 'menu_item', $2, $3)`,
          [req.user.sub, id, JSON.stringify({ old_price: Number(existing.rows[0].price), new_price: Number(price) })]
        );
        await client.query('RELEASE SAVEPOINT sp_audit');
      } catch (err) {
        console.error('[audit_log] insert failed during menu update:', err);
        try { await client.query('ROLLBACK TO SAVEPOINT sp_audit'); } catch {}
      }
    }

    // Ingredients are linked per menu item, not per variant or flavor.
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

    // Reconcile the submitted options against the stored ones.
    //
    // This deliberately does NOT delete-then-insert the way the ingredient list
    // above does. order_items.menu_item_option_id holds a hard FK to
    // menu_item_options(id) with NO ACTION, so re-creating a row would either
    // fail outright once the option had been sold, or silently orphan the
    // order lines that referenced the old id. Existing rows are therefore
    // UPDATEd in place, which keeps their ids and keeps history resolvable.
    if (options !== undefined) {
      const list = Array.isArray(options) ? options : [];

      // 1. Update the ones that came from the server, matching on the id the
      //    form was given and confirming it really belongs to this item.
      const keptIds = [];
      for (const [i, opt] of list.entries()) {
        const optId = Number(opt?.id);
        if (!Number.isInteger(optId)) continue;
        const updated = await client.query(
          `UPDATE menu_item_options
              SET name = $1, price = $2, is_available = $3, sort_order = $4,
                  option_kind = $5, updated_at = NOW()
            WHERE id = $6 AND menu_item_id = $7 AND archived_at IS NULL
            RETURNING id`,
          [
            String(opt.name).trim(),
            Number(opt.price) || 0,
            opt.is_available !== false,
            i,
            opt.option_kind === 'flavor' ? 'flavor' : 'variant',
            optId,
            id,
          ]
        );
        // Only trust the id if a row for THIS item actually moved. An id from
        // elsewhere falls through and is inserted as a new option instead of
        // silently re-pointing another item's variant.
        // RETURNING matters here: without it pg reports an empty rows array for
        // an UPDATE and this branch would never run.
        if (updated.rows.length > 0) keptIds.push(optId);
      }

      // 2. Insert the genuinely new ones (no id from the server).
      const inserts = list.filter(
        (o) => !Number.isInteger(Number(o?.id)) && String(o?.name || '').trim()
      );
      if (inserts.length > 0) {
        const values = inserts
          .map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`)
          .join(', ');
        const params = inserts.flatMap((opt, i) => [
          id,
          String(opt.name).trim(),
          Number(opt.price) || 0,
          opt.is_available !== false,
          i,
          opt.option_kind === 'flavor' ? 'flavor' : 'variant',
        ]);
        const added = await client.query(
          `INSERT INTO menu_item_options (menu_item_id, name, price, is_available, sort_order, option_kind)
           VALUES ${values} RETURNING id`,
          params
        );
        // Keep these too, or step 3 would archive the options just added.
        keptIds.push(...added.rows.map((r) => r.id));
      }

      // 3. Archive the live options the form dropped. Archived, not deleted:
      //    a sold variant must keep resolving for its receipts.
      await client.query(
        `UPDATE menu_item_options
            SET archived_at = NOW(), is_available = false, updated_at = NOW()
          WHERE menu_item_id = $1
            AND archived_at IS NULL
            AND NOT (id = ANY($2::int[]))`,
        [id, keptIds]
      );
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

    try {
      await db.query(
        `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
         VALUES ($1, 'menu_availability_toggled', 'menu_item', $2, $3)`,
        [req.user.sub, id, JSON.stringify({ is_available })]
      );
    } catch (auditErr) {
      console.error('[audit_log] menu availability insert error:', auditErr);
    }

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
    // Archive, don't delete.
    //
    // `order_items.menu_item_id` is NOT NULL and has no ON DELETE clause, and
    // order_items stores no name snapshot — only quantity and unit_price. So a
    // hard DELETE of an item that has ever been ordered fails with FK violation
    // 23503. Before this, that reached next(err) and the caller saw a bare 500,
    // which is why no menu item could be deleted at all.
    //
    // Keeping the row lets past orders keep resolving to a name and price.
    // Menu listings filter on archived_at IS NULL, so the item disappears from
    // the menu while the history stays intact.
    const result = await db.query(
      `UPDATE menu_items
          SET archived_at = NOW(), is_available = false, updated_at = NOW()
        WHERE id = $1 AND archived_at IS NULL
        RETURNING id, name, category_id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      // Either it does not exist, or it was already archived.
      const existing = await db.query(
        'SELECT id, name, archived_at FROM menu_items WHERE id = $1',
        [req.params.id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: 'Menu item not found.' });
      }
      return res.status(409).json({
        message: `"${existing.rows[0].name}" is already removed from the menu.`,
      });
    }

    if (_io) _io.emit('menu_item_deleted', { id: result.rows[0].id });
    res.json({
      message: 'Menu item removed.',
      archived: result.rows[0],
    });
  } catch (err) {
    // Safety net: if a hard delete is ever reintroduced, fail with a readable
    // message instead of a raw constraint violation bubbling out as a 500.
    if (err.code === '23503') {
      return res.status(409).json({
        message:
          'This item appears in past orders, so it cannot be erased. Mark it unavailable instead.',
      });
    }
    next(err);
  }
}

// ─── Menu item options (variants: Hot / Iced, sizes, flavours) ────────────────

/**
 * Options for the given item ids, grouped by menu_item_id.
 *
 * Exported because createOrder and updateOrderItems both need to price a
 * cart, and both already fetch their menu items in one round trip. Folding
 * the options into that same query shape keeps order pricing to two queries
 * no matter how many lines the cart has.
 *
 * Archived options are excluded: an archived variant is not sellable, so
 * quoting one would let a price slip through for something the staff page
 * has taken off the menu.
 */
async function fetchOptionsForItems(ids) {
  const unique = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (unique.length === 0) return new Map();

  const { rows } = await db.query(
    `SELECT id, menu_item_id, name, price, is_available, sort_order, option_kind
       FROM menu_item_options
      WHERE menu_item_id = ANY($1::int[])
        AND archived_at IS NULL
      ORDER BY menu_item_id, sort_order, name`,
    [unique]
  );

  const byItem = new Map();
  for (const r of rows) {
    if (!byItem.has(r.menu_item_id)) byItem.set(r.menu_item_id, []);
    byItem.get(r.menu_item_id).push({
      id: r.id,
      name: r.name,
      price: parseFloat(r.price),
      is_available: r.is_available,
      option_kind: r.option_kind === 'flavor' ? 'flavor' : 'variant',
    });
  }
  return byItem;
}

// Attach `options` to already-fetched menu rows, without an N+1 per item.
function attachOptions(items, byItem) {
  return items.map((it) => ({ ...it, options: byItem.get(it.id) || [] }));
}

async function _getEnrichedItemWithOptions(id) {
  const item = await _getEnrichedItem(id);
  if (!item) return null;
  return item;
}

// ─── POST /api/menu/:id/options ──────────────────────────────────────────────
async function createOption(req, res, next) {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { name, price, is_available = true, sort_order = 0, option_kind } = req.body;

    if (!name?.trim()) return res.status(400).json({ message: 'Option name is required.' });
    if (price === undefined || price === null || Number(price) < 0) {
      return res.status(400).json({ message: 'A valid price is required.' });
    }

    const item = await db.query('SELECT id FROM menu_items WHERE id = $1', [id]);
    if (item.rows.length === 0) return res.status(404).json({ message: 'Menu item not found.' });

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO menu_item_options (menu_item_id, name, price, is_available, sort_order, option_kind)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, menu_item_id, name, price, is_available, sort_order, option_kind`,
      [id, name.trim(), Number(price), is_available, Number(sort_order) || 0, option_kind === 'flavor' ? 'flavor' : 'variant']
    );
    await client.query('COMMIT');

    const row = result.rows[0];
    res.status(201).json({ ...row, price: parseFloat(row.price) });
  } catch (err) {
    await client.query('ROLLBACK');
    // The UNIQUE(menu_item_id, name) guard turned into a readable message
    // rather than a raw 23505 bubbling out of the error handler. The name is
    // re-read from req.body because the destructured copy above is scoped to
    // the try block.
    if (err.code === '23505') {
      return res.status(409).json({
        message: `"${String(req.body?.name || '').trim()}" is already an option for this item.`,
      });
    }
    next(err);
  } finally {
    client.release();
  }
}

// ─── PUT /api/menu/:id/options/:optionId ─────────────────────────────────────
async function updateOption(req, res, next) {
  try {
    const { id, optionId } = req.params;
    const { name, price, is_available, sort_order, option_kind } = req.body;

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ message: 'Option name cannot be empty.' });
    }
    if (option_kind !== undefined && option_kind !== 'variant' && option_kind !== 'flavor') {
      return res.status(400).json({ message: 'option_kind must be "variant" or "flavor".' });
    }
    if (price !== undefined && (Number(price) < 0 || Number.isNaN(Number(price)))) {
      return res.status(400).json({ message: 'Price must be zero or more.' });
    }

    const sets = [];
    const params = [];
    let n = 1;
    if (name        !== undefined) { sets.push(`name = $${n++}`);         params.push(name.trim()); }
    if (price       !== undefined) { sets.push(`price = $${n++}`);        params.push(Number(price)); }
    if (is_available!== undefined) { sets.push(`is_available = $${n++}`); params.push(is_available); }
    if (sort_order  !== undefined) { sets.push(`sort_order = $${n++}`);   params.push(Number(sort_order) || 0); }
    if (option_kind !== undefined) { sets.push(`option_kind = $${n++}`);  params.push(option_kind); }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'Nothing to update.' });
    }
    sets.push(`updated_at = NOW()`);
    params.push(optionId, id);

    const result = await db.query(
      `UPDATE menu_item_options SET ${sets.join(', ')}
        WHERE id = $${n++} AND menu_item_id = $${n}
        RETURNING id, menu_item_id, name, price, is_available, sort_order, option_kind`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Option not found.' });
    }
    res.json({ ...result.rows[0], price: parseFloat(result.rows[0].price) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'That option name is already in use for this item.' });
    }
    next(err);
  }
}

// ─── DELETE /api/menu/:id/options/:optionId ──────────────────────────────────
// Archive, for the same reason menu items are archived (migration 008).
async function deleteOption(req, res, next) {
  try {
    const { id, optionId } = req.params;
    const result = await db.query(
      `UPDATE menu_item_options
          SET archived_at = NOW(), is_available = false, updated_at = NOW()
        WHERE id = $1 AND menu_item_id = $2 AND archived_at IS NULL
        RETURNING id, name`,
      [optionId, id]
    );

    if (result.rows.length === 0) {
      const existing = await db.query(
        'SELECT id, name, archived_at FROM menu_item_options WHERE id = $1 AND menu_item_id = $2',
        [optionId, id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: 'Option not found.' });
      }
      return res.status(409).json({
        message: `"${existing.rows[0].name}" is already removed from this item.`,
      });
    }

    res.json({ message: 'Option removed.', archived: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        message: 'This option was sold in past orders, so it cannot be erased. Mark it unavailable instead.',
      });
    }
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

    // Ingredients carry the same categories and can sit in several at once, so
    // this needs its own check. Without it the join table's ON DELETE CASCADE
    // would quietly strip the tag off every ingredient in this category - the
    // ingredient survives, but it drops out of that category's filter with no
    // trace and no warning.
    const inIngredients = await db.query(
      'SELECT COUNT(*) FROM inventory_item_categories WHERE menu_category_id = $1', [id]
    );
    if (parseInt(inIngredients.rows[0].count, 10) > 0) {
      return res.status(409).json({
        message: 'Cannot delete a category that still has inventory items. Remove it from those ingredients first.',
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
  emitAvailabilityUpdates,
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
  fetchOptionsForItems,
  createOption,
  updateOption,
  deleteOption,
};