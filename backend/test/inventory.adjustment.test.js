/**
 * Tests for the cashier "Adjust stock" flow (POST /api/inventory/:id/transaction
 * with change_type='adjustment').
 *
 * An adjustment *sets* the stock to a physically counted value (up or down),
 * unlike restock (adds) or deduction (subtracts). Covered here:
 *
 *   1. Adjusting down sets the stock to the counted value.
 *   2. Adjusting up sets the stock to the counted value.
 *   3. Adjusting to 0 is allowed (a full correction down).
 *   4. A negative adjustment is rejected.
 *   5. Restock still rejects 0 (the relaxation is adjustment-only).
 *   6. Adjusting an out-of-stock ingredient upward re-enables its menu items.
 *
 * Database-backed tests are skipped when no database is reachable. Each test
 * builds its own throwaway ingredient (and menu item) and removes it
 * afterwards, so seeded data is untouched. `inventory_transactions` rows are
 * removed before the ingredient because of the FK.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

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

// ─── Auth + app ───────────────────────────────────────────────────────────────

const tokens = {};
const signIn = async (role = 'admin') => {
  if (tokens[role]) return tokens[role];
  const account = await db.query(
    `SELECT id FROM staff_accounts WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`,
    [role]
  );
  if (account.rowCount === 0) return null;
  const jwt = require('jsonwebtoken');
  tokens[role] = jwt.sign(
    { sub: account.rows[0].id, type: 'staff', role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  );
  return tokens[role];
};

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/inventory', require('../src/modules/inventory/inventory.routes'));
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

const transaction = (id, body, role) => call('POST', `/api/inventory/${id}/transaction`, { body, role });

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let seq = 0;

/**
 * A throwaway ingredient with `stock` on hand. When `link` is set, also creates
 * a menu item that consumes it and (optionally) starts unavailable.
 */
async function createFixture({ stock, reorder = 0, link = false, available = false }) {
  const suffix = `${Date.now()}_${seq++}`;
  const ing = await db.query(
    `INSERT INTO inventory_items (name, unit, current_stock, reorder_level)
     VALUES ($1, 'g', $2, $3) RETURNING id`,
    [`__test_adj_ing_${suffix}`, stock, reorder]
  );

  let itemId = null;
  if (link) {
    const cat = await db.query('SELECT id FROM menu_categories ORDER BY id LIMIT 1');
    const item = await db.query(
      `INSERT INTO menu_items (category_id, name, price, is_available)
       VALUES ($1, $2, 10, $3) RETURNING id`,
      [cat.rows[0].id, `__test_adj_item_${suffix}`, available]
    );
    itemId = item.rows[0].id;
    await db.query(
      `INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required)
       VALUES ($1, $2, 1)`,
      [itemId, ing.rows[0].id]
    );
  }

  return { ingId: ing.rows[0].id, itemId };
}

async function cleanup(fx) {
  if (!fx) return;
  await db.query('DELETE FROM inventory_transactions WHERE inventory_item_id = $1', [fx.ingId]);
  if (fx.itemId) {
    await db.query('DELETE FROM menu_item_ingredients WHERE menu_item_id = $1', [fx.itemId]);
    await db.query('DELETE FROM menu_items WHERE id = $1', [fx.itemId]);
  }
  await db.query('DELETE FROM inventory_items WHERE id = $1', [fx.ingId]);
}

const stockOf = async (id) =>
  parseFloat((await db.query('SELECT current_stock FROM inventory_items WHERE id = $1', [id])).rows[0].current_stock);
const availOf = async (id) =>
  (await db.query('SELECT is_available FROM menu_items WHERE id = $1', [id])).rows[0].is_available;
const lastTxn = async (id) =>
  (await db.query(
    `SELECT change_type, quantity FROM inventory_transactions
      WHERE inventory_item_id = $1 ORDER BY id DESC LIMIT 1`,
    [id]
  )).rows[0];

// ─── 1. Adjust down ───────────────────────────────────────────────────────────

test('adjusting down sets the stock to the counted value', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 100, reorder: 10 });
  try {
    const res = await transaction(fx.ingId, { change_type: 'adjustment', quantity: 37 });
    assert.equal(res.status, 200);
    assert.equal(res.body.current_stock, 37);
    assert.equal(res.body.change_type, 'adjustment');

    assert.equal(await stockOf(fx.ingId), 37, 'stock is set to the counted value');

    const txn = await lastTxn(fx.ingId);
    assert.equal(txn.change_type, 'adjustment');
    assert.equal(parseFloat(txn.quantity), 37);
  } finally {
    await cleanup(fx);
  }
});

// ─── 2. Adjust up ─────────────────────────────────────────────────────────────

test('adjusting up sets the stock to the counted value', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 5 });
  try {
    const res = await transaction(fx.ingId, { change_type: 'adjustment', quantity: 80 });
    assert.equal(res.status, 200);
    assert.equal(res.body.current_stock, 80);
    assert.equal(await stockOf(fx.ingId), 80);
  } finally {
    await cleanup(fx);
  }
});

// ─── 3. Adjust to zero ────────────────────────────────────────────────────────

test('adjusting to 0 is allowed', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 42 });
  try {
    const res = await transaction(fx.ingId, { change_type: 'adjustment', quantity: 0 });
    assert.equal(res.status, 200);
    assert.equal(res.body.current_stock, 0);
    assert.equal(await stockOf(fx.ingId), 0);
  } finally {
    await cleanup(fx);
  }
});

// ─── 4. Negative rejected ─────────────────────────────────────────────────────

test('a negative adjustment is rejected', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 42 });
  try {
    const res = await transaction(fx.ingId, { change_type: 'adjustment', quantity: -5 });
    assert.equal(res.status, 400);
    assert.equal(await stockOf(fx.ingId), 42, 'stock is untouched');
  } finally {
    await cleanup(fx);
  }
});

// ─── 5. Restock still requires a positive amount ──────────────────────────────

test('restock still rejects a zero quantity', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 42 });
  try {
    const res = await transaction(fx.ingId, { change_type: 'restock', quantity: 0 });
    assert.equal(res.status, 400);
    assert.equal(await stockOf(fx.ingId), 42, 'stock is untouched');
  } finally {
    await cleanup(fx);
  }
});

// ─── 6. Adjusting upward re-enables linked menu items ─────────────────────────

test('adjusting an out-of-stock ingredient upward re-enables its menu items', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createFixture({ stock: 0, link: true, available: false });
  try {
    const res = await transaction(fx.ingId, { change_type: 'adjustment', quantity: 50 });
    assert.equal(res.status, 200);
    assert.equal(res.body.auto_enabled_menu_items.length, 1, 'the linked item is re-enabled');
    assert.equal(await availOf(fx.itemId), true, 'menu item becomes available again');
  } finally {
    await cleanup(fx);
  }
});

// ─── 7. A cashier may post an adjustment ──────────────────────────────────────

test('a cashier is permitted to adjust stock', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  if (!(await signIn('cashier'))) return t.skip('no active cashier account');

  const fx = await createFixture({ stock: 100 });
  try {
    const res = await transaction(fx.ingId, { change_type: 'adjustment', quantity: 12 }, 'cashier');
    assert.equal(res.status, 200);
    assert.equal(await stockOf(fx.ingId), 12);
  } finally {
    await cleanup(fx);
  }
});
