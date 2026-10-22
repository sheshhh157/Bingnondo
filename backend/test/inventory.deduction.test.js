/**
 * Tests for automatic ingredient usage (Flowchart 2, "Record Ingredient Usage").
 *
 * When an order enters 'preparing' the ingredients it consumes are deducted
 * from stock and logged as `deduction` rows tied to the order via
 * `inventory_transactions.reference_order_id`. Covered here:
 *
 *   1. Reaching 'preparing' deducts the right amount and logs a reference row.
 *   2. Nothing is deducted before 'preparing'.
 *   3. A second pass for the same order is a no-op (idempotency).
 *   4. A deduction larger than the stock on hand clamps at 0 and takes the
 *      linked menu items down with it.
 *   5. An ingredient that crosses its reorder level is reported as "newly low".
 *   6. Links with no quantity set are skipped.
 *   7. A recipe unit (ml) converts into the ingredient stock unit (liter).
 *
 * Database-backed tests are skipped when no database is reachable. Each test
 * builds its own throwaway ingredient / menu item / order and removes it
 * afterwards, so the seeded data is untouched. The order is removed *after*
 * its `inventory_transactions` rows: the `reference_order_id` foreign key has
 * no ON DELETE clause, so the order cannot go first.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const { applyOrderIngredientUsage } = require('../src/modules/inventory/deduction');

// ─── Database reachability ────────────────────────────────────────────────────

let db = null;
try {
  db = require('../src/config/db');
} catch {
  db = null;
}

const canQuery = async () => {
  if (!db) return false;
  try {
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

// ─── Auth + app (mirrors orders.status.test.js) ───────────────────────────────

let token = null;
const signIn = async (role = 'admin') => {
  if (token && token[role]) return token[role];
  const account = await db.query(
    `SELECT id FROM staff_accounts WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`,
    [role]
  );
  if (account.rowCount === 0) return null;
  const jwt = require('jsonwebtoken');
  token = token || {};
  token[role] = jwt.sign(
    { sub: account.rows[0].id, type: 'staff', role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  );
  return token[role];
};

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  return app;
}

async function call(method, path, { body, role = 'admin' } = {}) {
  const jwtToken = await signIn(role);
  if (!jwtToken) return { status: 0, body: null };
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const setStatus = (id, status) => call('PATCH', `/api/orders/${id}/status`, { body: { status } });
const kitchenSet = (id, status) => call('PATCH', `/api/kitchen/orders/${id}/status`, {
  body: { status }, role: 'kitchen_staff',
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let seq = 0;

/**
 * A self-contained order over one menu item that requires `qtyRequired` of one
 * ingredient per serving.
 */
async function createFixture({ stock, reorder = 0, qtyRequired = 1, orderQty = 1, status = 'confirmed', stockUnit = 'g', recipeUnit = null, conversionFactor = null }) {
  const suffix = `${Date.now()}_${seq++}`;
  const cat = await db.query('SELECT id FROM menu_categories ORDER BY id LIMIT 1');

  const ing = await db.query(
    `INSERT INTO inventory_items (name, unit, current_stock, reorder_level)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`__test_ing_${suffix}`, stockUnit, stock, reorder]
  );
  const item = await db.query(
    `INSERT INTO menu_items (category_id, name, price) VALUES ($1, $2, 10) RETURNING id`,
    [cat.rows[0].id, `__test_item_${suffix}`]
  );
  await db.query(
    `INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required, unit, conversion_factor)
     VALUES ($1, $2, $3, $4, $5)`,
    [item.rows[0].id, ing.rows[0].id, qtyRequired, recipeUnit, conversionFactor]
  );
  const order = await db.query(
    `INSERT INTO orders (order_type, status, order_channel, total_amount)
     VALUES ('counter', $1, 'web_counter', 100) RETURNING id`,
    [status]
  );
  await db.query(
    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
     VALUES ($1, $2, $3, 10)`,
    [order.rows[0].id, item.rows[0].id, orderQty]
  );

  return { ingId: ing.rows[0].id, itemId: item.rows[0].id, orderId: order.rows[0].id };
}

async function cleanup(fx) {
  if (!fx) return;
  await db.query('DELETE FROM inventory_transactions WHERE reference_order_id = $1', [fx.orderId]);
  await db.query('DELETE FROM orders WHERE id = $1', [fx.orderId]);
  await db.query('DELETE FROM menu_item_ingredients WHERE menu_item_id = $1', [fx.itemId]);
  await db.query('DELETE FROM menu_items WHERE id = $1', [fx.itemId]);
  await db.query('DELETE FROM inventory_items WHERE id = $1', [fx.ingId]);
}

const stockOf = async (id) =>
  parseFloat((await db.query('SELECT current_stock FROM inventory_items WHERE id = $1', [id])).rows[0].current_stock);
const availOf = async (id) =>
  (await db.query('SELECT is_available FROM menu_items WHERE id = $1', [id])).rows[0].is_available;
const deductionsOf = async (orderId) =>
  (await db.query(
    `SELECT quantity, inventory_item_id FROM inventory_transactions
      WHERE reference_order_id = $1 AND change_type = 'deduction'`,
    [orderId]
  )).rows;

// ─── 1. Deducts on 'preparing' ────────────────────────────────────────────────

test('reaching preparing deducts ingredient usage and logs a reference row', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 1000, reorder: 100, qtyRequired: 250, orderQty: 2 });
  try {
    const res = await kitchenSet(fx.orderId, 'preparing');
    assert.equal(res.status, 200);

    // 250 g/serving x 2 servings = 500 g deducted.
    assert.equal(await stockOf(fx.ingId), 500, 'stock should drop by the consumed amount');

    const rows = await deductionsOf(fx.orderId);
    assert.equal(rows.length, 1, 'exactly one deduction is logged');
    assert.equal(parseFloat(rows[0].quantity), 500);
    assert.equal(rows[0].inventory_item_id, fx.ingId);

    // Plenty of stock remains, so the item must stay available.
    assert.equal(await availOf(fx.itemId), true, 'item stays available while stock remains');
  } finally {
    await cleanup(fx);
  }
});

// ─── 2. No deduction before 'preparing' ───────────────────────────────────────

test('nothing is deducted before the kitchen starts preparing', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 1000, qtyRequired: 100, orderQty: 1, status: 'pending' });
  try {
    const res = await setStatus(fx.orderId, 'confirmed');
    assert.equal(res.status, 200);
    assert.equal(await stockOf(fx.ingId), 1000, 'stock is untouched at confirmed');
    assert.equal((await deductionsOf(fx.orderId)).length, 0, 'no deduction logged at confirmed');
  } finally {
    await cleanup(fx);
  }
});

// ─── 3. Idempotency ───────────────────────────────────────────────────────────

test('a second pass for the same order deducts nothing', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 1000, qtyRequired: 100, orderQty: 1 });
  try {
    const client = await db.getClient();
    let first, second;
    try {
      await client.query('BEGIN');
      first = await applyOrderIngredientUsage(client, fx.orderId, null);
      second = await applyOrderIngredientUsage(client, fx.orderId, null);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    assert.equal(first.alreadyApplied, false);
    assert.equal(first.deductions.length, 1);
    assert.equal(second.alreadyApplied, true, 'second pass is recognised as a replay');
    assert.equal(second.deductions.length, 0);

    assert.equal(await stockOf(fx.ingId), 900, 'stock is only reduced once');
    assert.equal((await deductionsOf(fx.orderId)).length, 1, 'only one deduction row exists');
  } finally {
    await cleanup(fx);
  }
});

// ─── 4. Clamp at zero + availability cascade ──────────────────────────────────

test('a deduction larger than stock clamps at 0 and disables linked items', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Needs 100 but only 30 on hand.
  const fx = await createFixture({ stock: 30, reorder: 10, qtyRequired: 100, orderQty: 1 });
  try {
    const res = await kitchenSet(fx.orderId, 'preparing');
    assert.equal(res.status, 200);

    assert.equal(await stockOf(fx.ingId), 0, 'stock never goes negative');
    const rows = await deductionsOf(fx.orderId);
    assert.equal(rows.length, 1);
    assert.equal(parseFloat(rows[0].quantity), 30, 'only the stock actually present is recorded');

    assert.equal(await availOf(fx.itemId), false, 'the dependent menu item is taken down');
  } finally {
    await cleanup(fx);
  }
});

// ─── 5. Newly-low reporting ───────────────────────────────────────────────────

test('an ingredient that crosses its reorder level is reported as newly low', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 100, reorder: 50, qtyRequired: 60, orderQty: 1 });
  try {
    const client = await db.getClient();
    let result;
    try {
      await client.query('BEGIN');
      result = await applyOrderIngredientUsage(client, fx.orderId, null);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    assert.equal(result.newlyLow.length, 1, 'the crossed threshold is reported once');
    assert.equal(result.newlyLow[0].itemId, fx.ingId);
    assert.equal(result.newlyLow[0].currentStock, 40);
    assert.equal(await availOf(fx.itemId), true, 'still above zero, so it stays available');
  } finally {
    await cleanup(fx);
  }
});

// ─── 6. NULL quantity links are skipped ───────────────────────────────────────

test('links with no quantity set are skipped', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 1000, qtyRequired: null, orderQty: 1 });
  try {
    const res = await kitchenSet(fx.orderId, 'preparing');
    assert.equal(res.status, 200);
    assert.equal(await stockOf(fx.ingId), 1000, 'no cost to apply, so no deduction');
    assert.equal((await deductionsOf(fx.orderId)).length, 0);
  } finally {
    await cleanup(fx);
  }
});

// ─── 7. Recipe unit converts to the stock unit ────────────────────────────────

test('a recipe unit converts into the ingredient stock unit', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  // Milk stocked in liters; recipe uses 150 ml per serving (= 0.15 L).
  const fx = await createFixture({
    stock: 12, stockUnit: 'liter',
    qtyRequired: 150, recipeUnit: 'ml', conversionFactor: 0.001,
    orderQty: 2,
  });
  try {
    const res = await kitchenSet(fx.orderId, 'preparing');
    assert.equal(res.status, 200);

    // 150 ml x 0.001 x 2 servings = 0.30 L — NOT 300.
    const remaining = await stockOf(fx.ingId);
    assert.ok(Math.abs(remaining - 11.7) < 1e-9, `expected 11.7 L remaining, got ${remaining}`);

    const rows = await deductionsOf(fx.orderId);
    assert.equal(rows.length, 1);
    assert.ok(Math.abs(parseFloat(rows[0].quantity) - 0.3) < 1e-6, 'deduction is recorded in stock units');
  } finally {
    await cleanup(fx);
  }
});
