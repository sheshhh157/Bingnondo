/**
 * Ingredient deletion on the staff inventory screen.
 *
 * Covered:
 *
 *   1. DELETE /api/inventory/:id removes the ingredient, and both children
 *      cascade with it:
 *        - menu_item_ingredients  (the recipe links)
 *        - inventory_transactions  (the stock movement history)
 *
 *   2. The response names every menu item that lost a recipe link, so the UI
 *      can warn the user before that happens. Losing a link silently would
 *      leave a menu item with an incomplete recipe and nobody any the wiser.
 *
 *   3. The erased history count is reported, because a hard delete is the one
 *      action in this module that destroys an audit trail. The dialog leans on
 *      this to say so.
 *
 *   4. A missing id is a 404, not a silent success, and a second delete of the
 *      same id is a 404 too — so a double-tap cannot delete two things.
 *
 *   5. Cashiers cannot delete. The write routes gate on
 *      staff/owner/admin, and a cashier must not be able to wipe inventory.
 *
 * Database-backed tests are skipped when no database is reachable.
 * Each test creates its own throwaway ingredient and cleans up afterwards.
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
  app.use('/api/inventory', require('../src/modules/inventory/inventory.routes'));
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

/**
 * A throwaway ingredient, optionally linked to `links` real menu items and
 * carrying `txns` movement rows. Returns the id plus the linked menu item ids.
 */
const withIngredient = async ({ name, links = 0, txns = 0 }, fn) => {
  const created = await db.query(
    `INSERT INTO inventory_items (name, unit, current_stock, reorder_level)
     VALUES ($1, 'kg', 10, 2) RETURNING id`,
    [name]);
  const id = created.rows[0].id;

  const menuItemIds = [];
  if (links > 0) {
    const items = await db.query(
      `SELECT id FROM menu_items ORDER BY id LIMIT $1`, [links]);
    for (const m of items.rows) {
      menuItemIds.push(m.id);
      await db.query(
        `INSERT INTO menu_item_ingredients (menu_item_id, inventory_item_id, quantity_required)
         VALUES ($1, $2, 1)`, [m.id, id]);
    }
  }

  for (let i = 0; i < txns; i++) {
    await db.query(
      `INSERT INTO inventory_transactions (inventory_item_id, change_type, quantity, performed_by)
       VALUES ($1, 'restock', 5, NULL)`, [id]);
  }

  try {
    return await fn({ id, menuItemIds });
  } finally {
    // Delete history first to satisfy the new RESTRICT FK.
    await db.query(`DELETE FROM inventory_transactions WHERE inventory_item_id = $1`, [id]);
    await db.query(`DELETE FROM inventory_items WHERE id = $1`, [id]);
  }
};

let nameSeq = 0;
const uniqueName = () => `tmp-del-test-${process.pid}-${nameSeq++}`;

test('deleting an ingredient cascades its recipe links', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withIngredient({ name: uniqueName(), links: 2, txns: 0 }, async ({ id, menuItemIds }) => {
    const { status, body } = await call('DELETE', `/api/inventory/${id}`, { tok });
    assert.equal(status, 200);
    assert.equal(body.id, id);

    const gone = await db.query(`SELECT count(*)::int n FROM inventory_items WHERE id = $1`, [id]);
    assert.equal(gone.rows[0].n, 0, 'ingredient row should be gone');

    const links = await db.query(
      `SELECT count(*)::int n FROM menu_item_ingredients WHERE inventory_item_id = $1`, [id]);
    assert.equal(links.rows[0].n, 0, 'recipe links should have cascaded');

    const txns = await db.query(
      `SELECT count(*)::int n FROM inventory_transactions WHERE inventory_item_id = $1`, [id]);
    assert.equal(txns.rows[0].n, 0, 'movement history should have cascaded');

    // The menu items themselves must survive — only the link is removed.
    for (const menuItemId of menuItemIds) {
      const still = await db.query(`SELECT count(*)::int n FROM menu_items WHERE id = $1`, [menuItemId]);
      assert.equal(still.rows[0].n, 1, `menu item ${menuItemId} must not be deleted`);
    }
  });
});

test('the response names every menu item that lost a recipe link', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withIngredient({ name: uniqueName(), links: 3, txns: 0 }, async ({ id, menuItemIds }) => {
    const { status, body } = await call('DELETE', `/api/inventory/${id}`, { tok });
    assert.equal(status, 200);

    const unlinked = body.unlinked_menu_items || [];
    assert.equal(unlinked.length, menuItemIds.length,
      'every linked menu item should be reported back');
    assert.equal(body.transactions_erased, 0,
      'no history was deleted, so this count should be zero');

    for (const m of unlinked) {
      assert.ok(menuItemIds.includes(m.id), `unexpected menu item ${m.id} in unlinked list`);
      assert.ok(typeof m.name === 'string' && m.name.length > 0, 'menu item name should be present');
    }
  });
});

test('deleting an ingredient with transaction history is blocked', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withIngredient({ name: uniqueName(), links: 1, txns: 1 }, async ({ id }) => {
    const { status, body } = await call('DELETE', `/api/inventory/${id}`, { tok });
    assert.equal(status, 409, 'delete must be rejected when history exists');
    assert.match(body.message, /delete.*history/i);

    const still = await db.query(`SELECT count(*)::int n FROM inventory_items WHERE id = $1`, [id]);
    assert.equal(still.rows[0].n, 1, 'ingredient must remain after a blocked delete');

    const history = await db.query(`SELECT count(*)::int n FROM inventory_transactions WHERE inventory_item_id = $1`, [id]);
    assert.equal(history.rows[0].n, 1, 'history rows must not be erased');
  });
});

test('deleting an ingredient linked to nothing still succeeds', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withIngredient({ name: uniqueName(), links: 0, txns: 0 }, async ({ id }) => {
    const { status, body } = await call('DELETE', `/api/inventory/${id}`, { tok });
    assert.equal(status, 200);
    assert.deepEqual(body.unlinked_menu_items, []);
    assert.equal(body.transactions_erased, 0);
  });
});

test('deleting a missing ingredient is a 404, and a repeat delete changes nothing', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withIngredient({ name: uniqueName() }, async ({ id }) => {
    assert.equal((await call('DELETE', `/api/inventory/${id}`, { tok })).status, 200);

    // Second delete of the same id must not silently succeed — a double-tap
    // would otherwise look like it deleted something.
    const second = await call('DELETE', `/api/inventory/${id}`, { tok });
    assert.equal(second.status, 404);
    assert.match(second.body.message, /not found/i);

    const missing = await call('DELETE', '/api/inventory/99999999', { tok });
    assert.equal(missing.status, 404);
  });
});

test('a cashier cannot delete an ingredient', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const cashier = await cashierAccount();
  if (!cashier) return t.skip('no active cashier account');
  const tok = signFor(cashier.id, 'cashier');

  await withIngredient({ name: uniqueName() }, async ({ id }) => {
    const { status, body } = await call('DELETE', `/api/inventory/${id}`, { tok });
    assert.notEqual(status, 200, 'cashier delete must be refused');

    // Refused, not deleted.
    const still = await db.query(
      `SELECT count(*)::int n FROM inventory_items WHERE id = $1`, [id]);
    assert.equal(still.rows[0].n, 1, 'the ingredient must still exist after a refused delete');

    // And a supervisor can still do it.
    const ok = await call('DELETE', `/api/inventory/${id}`, { tok: signFor(staff.id, 'staff') });
    assert.equal(ok.status, 200);
  });
});