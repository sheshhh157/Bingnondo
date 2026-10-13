const socketHub = require('../../sockets');

/**
 * deduction.js
 * ─────────────
 * Records ingredient usage for an order and deducts it from stock.
 *
 * Flowchart 2 ("Record Ingredient Usage" → "Update Stock Levels"): when the
 * kitchen starts preparing an order, the ingredients that order consumes are
 * deducted from inventory and logged as `deduction` rows tied to the order via
 * `inventory_transactions.reference_order_id`.
 *
 * Must run inside the caller's transaction so the status change and the stock
 * movement commit or roll back together. Idempotent: a second call for the same
 * order is a no-op, which keeps the three endpoints that can reach 'preparing'
 * (kitchen acknowledge, kitchen status, orders status) from double-deducting.
 */

/**
 * Deduct the ingredients consumed by an order.
 *
 * @param {import('pg').PoolClient} client  caller's transaction client
 * @param {number|string} orderId
 * @param {number|null} performedBy         staff_accounts.id, or null
 * @returns {Promise<{
 *   alreadyApplied: boolean,
 *   deductions: Array<{ itemId:number, name:string, deducted:number, currentStock:number, reorderLevel:number }>,
 *   newlyDisabled: Array<{ id:number, name:string }>,
 *   newlyLow: Array<{ itemId:number, name:string, currentStock:number, reorderLevel:number }>,
 * }>}
 */
async function applyOrderIngredientUsage(client, orderId, performedBy = null) {
  // Idempotency: one deduction pass per order, keyed off the reference column.
  // A re-set of 'preparing', or a second of the three entry points firing,
  // finds the row and stops instead of deducting twice.
  const already = await client.query(
    `SELECT 1 FROM inventory_transactions
      WHERE reference_order_id = $1 AND change_type = 'deduction'
      LIMIT 1`,
    [orderId]
  );
  if (already.rows.length > 0) {
    return { alreadyApplied: true, deductions: [], newlyDisabled: [], newlyLow: [] };
  }

  // Aggregate required per ingredient. Links with no quantity set are skipped:
  // there is no cost to apply, so they cannot drive a deduction.
  const need = await client.query(
    `SELECT mii.inventory_item_id AS id,
            SUM(mii.quantity_required * oi.quantity) AS needed
       FROM order_items oi
       JOIN menu_item_ingredients mii ON mii.menu_item_id = oi.menu_item_id
      WHERE oi.order_id = $1
        AND mii.quantity_required IS NOT NULL
        AND mii.quantity_required > 0
      GROUP BY mii.inventory_item_id`,
    [orderId]
  );

  const deductions = [];
  const newlyLow = [];
  const depleted = [];

  for (const row of need.rows) {
    // Lock the ingredient so concurrent deductions cannot lose an update.
    const lock = await client.query(
      `SELECT id, name, current_stock, reorder_level
         FROM inventory_items WHERE id = $1 FOR UPDATE`,
      [row.id]
    );
    if (lock.rows.length === 0) continue;

    const { name } = lock.rows[0];
    const current = parseFloat(lock.rows[0].current_stock);
    const reorder = parseFloat(lock.rows[0].reorder_level);
    const needed = parseFloat(row.needed);
    // Clamp: stock never goes negative. Record only what actually left.
    const applied = Math.min(current, needed);
    const next = current - applied;

    await client.query(
      'UPDATE inventory_items SET current_stock = $1, updated_at = NOW() WHERE id = $2',
      [next, row.id]
    );

    await client.query(
      `INSERT INTO inventory_transactions
         (inventory_item_id, change_type, quantity, reference_order_id, performed_by)
       VALUES ($1, 'deduction', $2, $3, $4)`,
      [row.id, applied, orderId, performedBy]
    );

    deductions.push({ itemId: row.id, name, deducted: applied, currentStock: next, reorderLevel: reorder });

    // Crossed into "low" (was above the threshold, now at/below it).
    if (next <= reorder && current > reorder) {
      newlyLow.push({ itemId: row.id, name, currentStock: next, reorderLevel: reorder });
    }
    if (next <= 0) depleted.push(row.id);
  }

  // When an ingredient runs out, take down the menu items that depend on it —
  // the same cascade the manual "Out of stock" action performs.
  let newlyDisabled = [];
  if (depleted.length > 0) {
    const res = await client.query(
      `UPDATE menu_items
          SET is_available = false, updated_at = NOW()
        WHERE is_available = true
          AND id IN (
            SELECT menu_item_id FROM menu_item_ingredients
             WHERE inventory_item_id = ANY($1)
          )
        RETURNING id, name`,
      [depleted]
    );
    newlyDisabled = res.rows;
  }

  return { alreadyApplied: false, deductions, newlyDisabled, newlyLow };
}

/**
 * Push a completed deduction pass to connected clients.
 *
 * Called after COMMIT by the controllers that triggered the usage. Emits the
 * new stock level (so stock lists recompute their low/out counts live) plus a
 * dedicated low-stock signal the manager dashboard can raise as an alert.
 */
function emitIngredientUsage(usage) {
  if (!usage || usage.alreadyApplied) return;

  for (const d of usage.deductions) {
    socketHub.emitInventoryUpdate({
      itemId: d.itemId,
      name: d.name,
      currentStock: d.currentStock,
      reorderLevel: d.reorderLevel,
    });
  }

  for (const m of usage.newlyDisabled) {
    socketHub.emitMenuUpdate({ id: m.id, name: m.name, is_available: false });
  }

  if (usage.newlyLow.length > 0 || usage.newlyDisabled.length > 0) {
    socketHub.emitLowStock({ low: usage.newlyLow, disabled: usage.newlyDisabled });
  }
}

module.exports = { applyOrderIngredientUsage, emitIngredientUsage };
