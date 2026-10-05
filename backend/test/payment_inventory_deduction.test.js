/* eslint-env node */
const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

let db = null;
try {
  db = require('../src/config/db');
} catch {
  // no-op
}

let token = null;
const signIn = async (role = 'cashier') => {
  if (token && token[role]) return token[role];
  const account = await db.query(
    `SELECT id FROM staff_accounts WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`,
    [role]);
  if (account.rowCount === 0) return null;
  const jwt = require('jsonwebtoken');
  token = token || {};
  token[role] = jwt.sign(
    { sub: account.rows[0].id, type: 'staff', role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' },
  );
  return token[role];
};

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/payments', require('../src/modules/payments/payments.routes'));
  return app;
}

async function call(method, path, { body, role = 'cashier' } = {}) {
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

async function createMenuItemWithIngredients(name, ingredientMap) {
  // Get a category id
  const cat = await db.query(`SELECT id FROM menu_categories LIMIT 1`);
  const { rows: [menuRow] } = await db.query(
    `INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES ($1, $2, '', 10, true) RETURNING id`,
    [cat.rows[0].id, name]
  );
  // ingredientMap: Array of { name, stock, required }
  for (const ing of ingredientMap) {
    const { rows: [inv] } = await db.query(
      `INSERT INTO inventory_items (name, unit, current_stock, reorder_level) VALUES ($1, 'unit', $2, 0) RETURNING id`,
      [ing.name, ing.stock]
    );
    await db.query(
      `INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required) VALUES ($1, $2, $3)`,
      [menuRow.id, inv.id, ing.required]
    );
  }
  return menuRow.id;
}

test('paying an order decrements stock for every linked ingredient', async (t) => {
  if (!db) return t.skip('no database');
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);

  const menuId = await createMenuItemWithIngredients('Deduction Test A', [
    { name: 'DV Stock A', stock: 1000, required: 1 },
    { name: 'DV Stock B', stock: 1000, required: 2 },
  ]);

  const created = await call('POST', '/api/orders', {
    body: { items: [{ menu_item_id: menuId, quantity: 3 }] },
    role: 'cashier',
  });
  assert.equal(created.status, 201);
  const orderId = created.body.id;

  const paid = await call('POST', '/api/payments', {
    body: { order_id: orderId, method: 'cash', cash_given: 1000 },
    role: 'cashier',
  });
  assert.equal(paid.status, 200);

  const stockA = (await db.query(`SELECT current_stock FROM inventory_items WHERE name='DV Stock A'`)).rows[0].current_stock;
  const stockB = (await db.query(`SELECT current_stock FROM inventory_items WHERE name='DV Stock B'`)).rows[0].current_stock;
  assert.equal(parseFloat(stockA), 997); // 1000 - 3*1
  assert.equal(parseFloat(stockB), 994); // 1000 - 3*2

  const rows = (await db.query(`SELECT * FROM inventory_transactions WHERE reference_order_id = $1`, [orderId])).rows;
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert(r.quantity < 0);
    assert.equal(r.change_type, 'deduction');
  }

  await db.query(`DELETE FROM inventory_transactions WHERE reference_order_id = $1`, [orderId]);
await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
await db.query(`DELETE FROM order_items WHERE menu_item_id = $1`, [menuId]);
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);
  await db.query(`DELETE FROM menu_items WHERE name = 'Deduction Test A'`);
});

test('two lines sharing an ingredient aggregate into one ledger row', async (t) => {
  if (!db) return t.skip('no database');
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);

  const menuId = await createMenuItemWithIngredients('Deduction Test B', [
    { name: 'DV Stock C', stock: 1000, required: 2 },
  ]);

  const created = await call('POST', '/api/orders', {
    body: { items: [{ menu_item_id: menuId, quantity: 2 }, { menu_item_id: menuId, quantity: 1 }] },
    role: 'cashier',
  });
  assert.equal(created.status, 201);
  const orderId = created.body.id;

  // payment
  const paid = await call('POST', '/api/payments', { body: { order_id: orderId, method: 'cash', cash_given: 1000 }, role: 'cashier' });
  assert.equal(paid.status, 200);

  // expected deduction = (2+1) * 2 = 6
  const stockC = (await db.query(`SELECT current_stock FROM inventory_items WHERE name='DV Stock C'`)).rows[0].current_stock;
  assert.equal(parseFloat(stockC), 994);

  const rows = (await db.query(`SELECT * FROM inventory_transactions WHERE reference_order_id = $1`, [orderId])).rows;
  assert.equal(rows.length, 1);
  assert.equal(parseFloat(rows[0].quantity), -6);

  await db.query(`DELETE FROM inventory_transactions WHERE reference_order_id = $1`, [orderId]);
await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
await db.query(`DELETE FROM order_items WHERE menu_item_id = $1`, [menuId]);
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);
  await db.query(`DELETE FROM menu_items WHERE name = 'Deduction Test B'`);
});

test('paying twice deducts once (idempotent)', async (t) => {
  if (!db) return t.skip('no database');
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);

  const menuId = await createMenuItemWithIngredients('Deduction Test C', [
    { name: 'DV Stock D', stock: 1000, required: 1 },
  ]);

  const created = await call('POST', '/api/orders', {
    body: { items: [{ menu_item_id: menuId, quantity: 1 }] },
    role: 'cashier',
  });
  assert.equal(created.status, 201);
  const orderId = created.body.id;

  const firstPaid = await call('POST', '/api/payments', { body: { order_id: orderId, method: 'cash', cash_given: 1000 }, role: 'cashier' });
  assert.equal(firstPaid.status, 200);

  // second payment should be refused
  const secondPaid = await call('POST', '/api/payments', { body: { order_id: orderId, method: 'cash', cash_given: 1000 }, role: 'cashier' });
  assert.equal(secondPaid.status, 409);

  const stockD = (await db.query(`SELECT current_stock FROM inventory_items WHERE name='DV Stock D'`)).rows[0].current_stock;
  assert.equal(parseFloat(stockD), 999);

  const rows = (await db.query(`SELECT * FROM inventory_transactions WHERE reference_order_id = $1`, [orderId])).rows;
  assert.equal(rows.length, 1);
  assert.equal(parseFloat(rows[0].quantity), -1);

  await db.query(`DELETE FROM inventory_transactions WHERE reference_order_id = $1`, [orderId]);
await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
await db.query(`DELETE FROM order_items WHERE menu_item_id = $1`, [menuId]);
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);
  await db.query(`DELETE FROM menu_items WHERE name = 'Deduction Test C'`);
});

test('ingredient with zero quantity is untouched', async (t) => {
  if (!db) return t.skip('no database');
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);

  const menuId = await createMenuItemWithIngredients('Deduction Test D', [
    { name: 'DV Stock E', stock: 1000, required: 0 },
  ]);

  const created = await call('POST', '/api/orders', {
    body: { items: [{ menu_item_id: menuId, quantity: 1 }] },
    role: 'cashier',
  });
  assert.equal(created.status, 201);
  const orderId = created.body.id;

  const paid = await call('POST', '/api/payments', { body: { order_id: orderId, method: 'cash', cash_given: 1000 }, role: 'cashier' });
  assert.equal(paid.status, 200);

  const stockE = (await db.query(`SELECT current_stock FROM inventory_items WHERE name='DV Stock E'`)).rows[0].current_stock;
  assert.equal(parseFloat(stockE), 1000);

  const rows = (await db.query(`SELECT * FROM inventory_transactions WHERE reference_order_id = $1`, [orderId])).rows;
  assert.equal(rows.length, 0);

  await db.query(`DELETE FROM inventory_transactions WHERE reference_order_id = $1`, [orderId]);
await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
await db.query(`DELETE FROM order_items WHERE menu_item_id = $1`, [menuId]);
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);
  await db.query(`DELETE FROM menu_items WHERE name = 'Deduction Test D'`);
});

test('stock can go negative and sale still succeeds', async (t) => {
  if (!db) return t.skip('no database');
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);

  const menuId = await createMenuItemWithIngredients('Deduction Test E', [
    { name: 'DV Stock F', stock: 1, required: 5 },
  ]);

  const created = await call('POST', '/api/orders', {
    body: { items: [{ menu_item_id: menuId, quantity: 1 }] },
    role: 'cashier',
  });
  assert.equal(created.status, 201);
  const orderId = created.body.id;

  const paid = await call('POST', '/api/payments', { body: { order_id: orderId, method: 'cash', cash_given: 1000 }, role: 'cashier' });
  assert.equal(paid.status, 200);

  const stockF = (await db.query(`SELECT current_stock FROM inventory_items WHERE name='DV Stock F'`)).rows[0].current_stock;
  assert.equal(parseFloat(stockF), -4);

  await db.query(`DELETE FROM inventory_transactions WHERE reference_order_id = $1`, [orderId]);
await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
await db.query(`DELETE FROM order_items WHERE menu_item_id = $1`, [menuId]);
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);
  await db.query(`DELETE FROM menu_items WHERE name = 'Deduction Test E'`);
});

test('failed payment leaves stock and ledger unchanged', async (t) => {
  if (!db) return t.skip('no database');
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);

  const menuId = await createMenuItemWithIngredients('Deduction Test F', [
    { name: 'DV Stock G', stock: 1000, required: 1 },
  ]);

  const created = await call('POST', '/api/orders', {
    body: { items: [{ menu_item_id: menuId, quantity: 1 }] },
    role: 'cashier',
  });
  assert.equal(created.status, 201);
  const orderId = created.body.id;

  // Attempt with insufficient cash
  const paid = await call('POST', '/api/payments', { body: { order_id: orderId, method: 'cash', cash_given: 5 }, role: 'cashier' });
  assert.equal(paid.status, 400);

  const stockG = (await db.query(`SELECT current_stock FROM inventory_items WHERE name='DV Stock G'`)).rows[0].current_stock;
  assert.equal(parseFloat(stockG), 1000);

  const rows = (await db.query(`SELECT * FROM inventory_transactions WHERE reference_order_id = $1`, [orderId])).rows;
  assert.equal(rows.length, 0);

  await db.query(`DELETE FROM inventory_transactions WHERE reference_order_id = $1`, [orderId]);
await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
await db.query(`DELETE FROM order_items WHERE menu_item_id = $1`, [menuId]);
  await db.query(`DELETE FROM order_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE name LIKE 'Deduction Test%')`);
  await db.query(`DELETE FROM menu_items WHERE name LIKE 'Deduction Test%'`);
  await db.query('DELETE FROM inventory_transactions');
await db.query(`DELETE FROM inventory_items WHERE name LIKE 'DV Stock%'`);
  await db.query(`DELETE FROM menu_items WHERE name = 'Deduction Test F'`);
});

test('restock row for same order and ingredient is allowed after deduction', async (t) => {
  if (!db) return t.skip('no database');

  // reuse same testing setup, create menu item with one ingredient
  const menuId = await createMenuItemWithIngredients('RestockTest', [
    { name: 'DV Stock H', stock: 1000, required: 1 },
  ]);
  const created = await call('POST', '/api/orders', { body: { items: [{ menu_item_id: menuId, quantity: 1 }] }, role: 'cashier' });
  const orderId = created.body.id;
  const paid = await call('POST', '/api/payments', { body: { order_id: orderId, method: 'cash', cash_given: 1000 }, role: 'cashier' });
  assert.equal(paid.status, 200);
  // The deduction row should exist
  const txn = (await db.query(`SELECT * FROM inventory_transactions WHERE reference_order_id = $1`, [orderId])).rows[0];
  assert(txn);

  // Now try to insert a restock row for the same order and same ingredient
  const invId = txn.inventory_item_id;
  try {
    const result = await db.query(
      `INSERT INTO inventory_transactions (inventory_item_id, change_type, quantity, performed_by, reference_order_id) VALUES ($1, 'restock', $2, NULL, $3) RETURNING id`,
      [invId, 5, orderId]
    );
    assert(result.rowCount > 0, 'restock row should be inserted');
  } catch (err) {
    assert.fail('restock row insert failed');
  }
});

