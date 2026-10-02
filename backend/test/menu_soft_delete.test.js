/**
 * Removing a menu item from the menu (soft delete).
 *
 * Covered:
 *
 *   1. DELETE /api/menu/:id archives the item and returns 200. It used to
 *      return a bare 500 for every real menu item.
 *
 *   2. The reason it 500'd: `order_items.menu_item_id` is NOT NULL with no
 *      ON DELETE clause (so NO ACTION), and `order_items` has no name snapshot
 *      — only quantity and unit_price. A hard DELETE of an item that had ever
 *      been ordered therefore raised FK violation 23503, which the handler
 *      passed to next(err). All six real menu items had order history, so none
 *      of them could be deleted.
 *
 *      ON DELETE SET NULL was rejected as the fix: it would satisfy the FK but
 *      leave order_items pointing at nothing with no name to fall back on, so
 *      receipts would render blank. Keeping a hidden row loses nothing.
 *
 *   3. The archived row is hidden from both the public menu and the staff menu.
 *
 *   4. Past orders still resolve to the item's name and price after archiving.
 *      This is the whole point — an archived item must not lose its history.
 *
 *   5. A repeat delete is a readable 409, not a 500 and not a silent success,
 *      so a double-tap cannot look like it deleted something else.
 *
 *   6. A cashier cannot archive a menu item.
 *
 * Database-backed tests are skipped when no database is reachable.
 *
 * Run with: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

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

const skip = false;

const jwt = require('jsonwebtoken');

const signFor = (sub, role) =>
  jwt.sign({ sub, type: 'staff', role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/menu', require('../src/modules/menu/menu.routes'));
  return app;
}

async function call(method, path, { body, tok } = {}) {
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tok}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const staffAccount = async () =>
  (await db.query(
    `SELECT id FROM staff_accounts WHERE role = 'staff' AND status = 'active' ORDER BY id LIMIT 1`
  )).rows[0];

const cashierAccount = async () =>
  (await db.query(
    `SELECT id FROM staff_accounts WHERE role = 'cashier' AND status = 'active' ORDER BY id LIMIT 1`
  )).rows[0];

let nameSeq = 0;
const uniqueName = () => `tmp-menu-del-${process.pid}-${nameSeq++}`;

/**
 * A throwaway menu item, optionally already referenced by `usedByOrders`
 * historical orders — the situation that used to make deletion impossible.
 */
const withMenuItem = async ({ name, usedByOrders = 0, archived = false }, fn) => {
  const cat = (await db.query(`SELECT id FROM menu_categories ORDER BY id LIMIT 1`)).rows[0];
  const created = await db.query(
    `INSERT INTO menu_items (category_id, name, description, price, is_available, archived_at)
     VALUES ($1, $2, 'tmp', 50, $3, $4) RETURNING id`,
    [cat.id, name, !archived, archived ? new Date() : null]);
  const id = created.rows[0].id;

  const orderIds = [];
  for (let i = 0; i < usedByOrders; i++) {
    const o = await db.query(
      `INSERT INTO orders (order_type, status, order_channel, total_amount)
       VALUES ('counter', 'ready', 'web_counter', 50) RETURNING id`);
    orderIds.push(o.rows[0].id);
    await db.query(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
       VALUES ($1, $2, 1, 50)`, [o.rows[0].id, id]);
  }

  try {
    return await fn({ id, orderIds });
  } finally {
    // The orders must go first: order_items keeps a hard FK to menu_items, so
    // deleting the item while they exist would trip the constraint.
    for (const oid of orderIds) {
      await db.query(`DELETE FROM orders WHERE id = $1`, [oid]);
    }
    await db.query(`DELETE FROM menu_items WHERE id = $1`, [id]);
  }
};

test('a menu item with past orders can be removed (used to 500)', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withMenuItem({ name: uniqueName(), usedByOrders: 2 }, async ({ id }) => {
    const { status, body } = await call('DELETE', `/api/menu/${id}`, { tok });
    assert.equal(status, 200, 'archiving an ordered item must not fail');
    assert.equal(body.archived.id, id);

    const row = await db.query(
      `SELECT archived_at, is_available FROM menu_items WHERE id = $1`, [id]);
    assert.ok(row.rows[0].archived_at, 'archived_at should be set');
    assert.equal(row.rows[0].is_available, false, 'an archived item must not stay sellable');
  });
});

test('an archived item disappears from the public and staff menus', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withMenuItem({ name: uniqueName(), usedByOrders: 1 }, async ({ id }) => {
    const before = await call('GET', '/api/menu', { tok });
    assert.ok(before.body.items.some((i) => i.id === id), 'item should be listed before');

    assert.equal((await call('DELETE', `/api/menu/${id}`, { tok })).status, 200);

    const pub = await call('GET', '/api/menu', { tok });
    assert.ok(!pub.body.items.some((i) => i.id === id), 'must be gone from the public menu');

    const staffMenu = await call('GET', '/api/menu/staff', { tok });
    assert.ok(!staffMenu.body.items.some((i) => i.id === id), 'must be gone from the staff menu');
  });
});

test('past orders keep resolving to the item name and price after archiving', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withMenuItem({ name: uniqueName(), usedByOrders: 3 }, async ({ id }) => {
    assert.equal((await call('DELETE', `/api/menu/${id}`, { tok })).status, 200);

    // This is the behaviour a hard delete (or SET NULL) would have destroyed.
    const still = await db.query(
      `SELECT mi.name, oi.unit_price, oi.quantity
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.menu_item_id = $1`, [id]);
    assert.equal(still.rows.length, 3, 'order_items must still resolve to the item');
    assert.equal(still.rows[0].name.startsWith('tmp-menu-del-'), true,
      'the archived item must still carry its name for receipts');
    assert.equal(Number(still.rows[0].unit_price), 50);
  });
});

test('re-archiving an already removed item is a readable 409', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withMenuItem({ name: uniqueName(), usedByOrders: 1 }, async ({ id }) => {
    assert.equal((await call('DELETE', `/api/menu/${id}`, { tok })).status, 200);

    const second = await call('DELETE', `/api/menu/${id}`, { tok });
    assert.equal(second.status, 409);
    assert.match(second.body.message, /already removed/i);
  });
});

test('deleting a menu item that does not exist is a 404', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  const { status, body } = await call('DELETE', '/api/menu/99999999', { tok });
  assert.equal(status, 404);
  assert.match(body.message, /not found/i);
});

test('a cashier cannot remove a menu item', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const cashier = await cashierAccount();
  if (!cashier) return t.skip('no active cashier account');

  await withMenuItem({ name: uniqueName() }, async ({ id }) => {
    const { status } = await call('DELETE', `/api/menu/${id}`, {
      tok: signFor(cashier.id, 'cashier'),
    });
    assert.notEqual(status, 200, 'cashier delete must be refused');

    const row = await db.query(
      `SELECT archived_at FROM menu_items WHERE id = $1`, [id]);
    assert.equal(row.rows[0].archived_at, null, 'the item must still be on the menu');

    assert.equal((await call('DELETE', `/api/menu/${id}`, {
      tok: signFor(staff.id, 'staff') })).status, 200);
  });
});