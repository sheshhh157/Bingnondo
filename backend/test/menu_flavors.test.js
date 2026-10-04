/**
 * Variant + flavor combined pricing (migration 011).
 *
 * The rule under test: a line is sold as a VARIANT (Hot/Iced, Solo/Sharing)
 * plus an optional FLAVOR add-on, priced server-side as variant price +
 * flavor price (base price for flavor-only items). The kitchen ticket and the
 * order record must name both so the line can be made correctly.
 *
 * Covered:
 *   1. Staff can create an item with both variants and flavors; both ride
 *      along in the public menu with their option_kind.
 *   2. An order with variant + flavor is charged variant + flavor.
 *   3. An order with only a variant charges just the variant price.
 *   4. A variant-bearing item cannot be ordered without its variant.
 *   5. A flavor id sent in the variant slot is rejected.
 *   6. A variant id sent in the flavor slot is rejected.
 *   7. A flavor id from a different item is rejected.
 *   8. A flavor-only item prices without any option, and +flavor with one.
 *   9. PATCH /api/orders/:id/items re-prices with the same rules.
 *  10. The kitchen ticket names the flavor.
 *
 * Database-backed tests skip when no database is reachable.
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

const buildApp = () => {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/menu', require('../src/modules/menu/menu.routes'));
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  return app;
};

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

let seq = 0;
const uniq = () => `${process.pid}-${seq++}`;

/**
 * Inserts a menu item priced at `price` with options rows given as
 * [{ name, price, option_kind }]. Returns ids + created option map.
 */
const withItem = async ({ price = 50, options = [] }, fn) => {
  const cat = (await db.query(`SELECT id FROM menu_categories ORDER BY id LIMIT 1`)).rows[0];
  const created = await db.query(
    `INSERT INTO menu_items (category_id, name, description, price)
     VALUES ($1, $2, 'tmp', $3) RETURNING id`,
    [cat.id, `tmp-flavor-${uniq()}`, price]
  );
  const itemId = created.rows[0].id;

  const optionIds = {};
  for (const opt of options) {
    const o = await db.query(
      `INSERT INTO menu_item_options (menu_item_id, name, price, sort_order, option_kind)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [itemId, opt.name, opt.price, options.indexOf(opt), opt.option_kind || 'variant']
    );
    optionIds[opt.name] = o.rows[0].id;
  }

  try {
    return await fn({ itemId, optionIds });
  } finally {
    await db.query(`DELETE FROM menu_items WHERE id = $1`, [itemId]);
  }
};

const SOLO = { name: 'Solo', price: 80, option_kind: 'variant' };
const SHARING = { name: 'Sharing', price: 140, option_kind: 'variant' };
const ADOBO = { name: 'Adobo', price: 10, option_kind: 'flavor' };
const SISIG = { name: 'Sisig', price: 15, option_kind: 'flavor' };

test('staff can create an item with variants and flavors, and both ride along in the menu', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  const cat = (await db.query(
    `SELECT id FROM menu_categories WHERE name = 'Rice Meals' LIMIT 1`
  )).rows[0];
  assert.ok(cat, 'Rice Meals category should exist');

  const created = await call('POST', '/api/menu', {
    tok,
    body: {
      name: `tmp-api-flavor-${uniq()}`,
      price: 80,
      category_id: cat.id,
      options: [
        { name: 'Solo', price: 80, option_kind: 'variant' },
        { name: 'Sharing', price: 140, option_kind: 'variant' },
        { name: 'Adobo', price: 10, option_kind: 'flavor' },
      ],
    },
  });
  assert.equal(created.status, 201);
  const createdItemId = created.body?.id;
  try {
    const types = Object.fromEntries(
      (created.body.options || []).map((o) => [o.name, o.option_kind])
    );
    assert.equal(types.Solo, 'variant');
    assert.equal(types.Sharing, 'variant');
    assert.equal(types.Adobo, 'flavor');

    const pub = await call('GET', '/api/menu', { tok });
    assert.equal(pub.status, 200);
    const item = pub.body.items?.find((i) => i.id === createdItemId);
    assert.ok(item, 'item appears in the public menu');
    assert.equal(item.options.find((o) => o.name === 'Adobo')?.option_kind, 'flavor');
  } finally {
    if (createdItemId) await db.query(`DELETE FROM menu_items WHERE id = $1`, [createdItemId]);
  }
});

test('an order with variant + flavor is charged variant + flavor', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withItem({ price: 80, options: [SOLO, SHARING, ADOBO, SISIG] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: {
        items: [{
          menu_item_id: itemId,
          menu_item_option_id: optionIds.Solo,
          menu_item_flavor_id: optionIds.Adobo,
          quantity: 2,
        }],
      },
    });
    assert.equal(sold.status, 201);
    // Solo (80) + Adobo (10) = 90 each, qty 2 -> 180
    assert.equal(sold.body.total_amount, 180);
    const line = sold.body.items[0];
    assert.equal(line.menu_item_option_id, optionIds.Solo);
    assert.equal(line.option_name, 'Solo');
    assert.equal(line.menu_item_flavor_id, optionIds.Adobo);
    assert.equal(line.flavor_name, 'Adobo');
    assert.equal(line.unit_price, 90);

    await db.query('DELETE FROM orders WHERE id = $1', [sold.body.id]);
  });
});

test('an order with only a variant charges just the variant price', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withItem({ price: 80, options: [SOLO, SHARING, ADOBO] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_option_id: optionIds.Solo, quantity: 1 }] },
    });
    assert.equal(sold.status, 201);
    assert.equal(sold.body.total_amount, 80);
    await db.query('DELETE FROM orders WHERE id = $1', [sold.body.id]);
  });
});

test('a variant-bearing item cannot be ordered without its variant', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withItem({ price: 80, options: [SOLO, SHARING, ADOBO] }, async ({ itemId }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, quantity: 1 }] },
    });
    assert.equal(sold.status, 400);
    assert.match(sold.body?.message || '', /needs an option/i);
  });
});

test('a flavor id sent in the variant slot is rejected', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withItem({ price: 80, options: [SOLO, SHARING, ADOBO] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_option_id: optionIds.Adobo, quantity: 1 }] },
    });
    assert.equal(sold.status, 400);
  });
});

test('a variant id sent in the flavor slot is rejected', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withItem({ price: 80, options: [SOLO, SHARING, ADOBO] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: {
        items: [{
          menu_item_id: itemId,
          menu_item_option_id: optionIds.Solo,
          menu_item_flavor_id: optionIds.Sharing,
          quantity: 1,
        }],
      },
    });
    assert.equal(sold.status, 400);
    assert.match(sold.body?.message || '', /no such flavor/i);
  });
});

test('a flavor id from a different item is rejected', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withItem({ price: 80, options: [SOLO, SHARING] }, async ({ itemId, optionIds }) => {
    await withItem({ price: 40, options: [ADOBO] }, async ({ optionIds: otherIds }) => {
      const sold = await call('POST', '/api/orders', {
        tok,
        body: {
          items: [{
            menu_item_id: itemId,
            menu_item_option_id: optionIds.Solo,
            menu_item_flavor_id: otherIds.Adobo,
            quantity: 1,
          }],
        },
      });
      assert.equal(sold.status, 400);
      assert.match(sold.body?.message || '', /does not belong/i);
    });
  });
});

test('a flavor-only item prices at base price without a flavor, and base + flavor with one', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  // Appetizer-style: no variants, only flavors. Note no option_kind on the
  // variant path — the flavor id belongs in menu_item_flavor_id.
  await withItem({ price: 60, options: [{ name: 'Adobo', price: 10, option_kind: 'flavor' }] }, async ({ itemId, optionIds }) => {
    const plain = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, quantity: 1 }] },
    });
    assert.equal(plain.status, 201);
    assert.equal(plain.body.total_amount, 60);

    const flavored = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_flavor_id: optionIds.Adobo, quantity: 1 }] },
    });
    assert.equal(flavored.status, 201);
    assert.equal(flavored.body.total_amount, 70);

    await db.query('DELETE FROM orders WHERE id = ANY($1::int[])', [[plain.body.id, flavored.body.id]]);
  });
});

test('PATCH /api/orders/:id/items re-prices with the flavor attached', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withItem({ price: 80, options: [SOLO, SHARING, SISIG] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_option_id: optionIds.Solo, quantity: 1 }] },
    });
    assert.equal(sold.status, 201);

    const patched = await call('PATCH', `/api/orders/${sold.body.id}/items`, {
      tok,
      body: {
        items: [{
          menu_item_id: itemId,
          menu_item_option_id: optionIds.Sharing,
          menu_item_flavor_id: optionIds.Sisig,
          quantity: 1,
        }],
      },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.total_amount, 155); // Sharing 140 + Sisig 15

    await db.query('DELETE FROM orders WHERE id = $1', [sold.body.id]);
  });
});

test('the kitchen ticket names the flavor', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withItem({ price: 80, options: [SOLO, SHARING, ADOBO] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: {
        items: [{
          menu_item_id: itemId,
          menu_item_option_id: optionIds.Solo,
          menu_item_flavor_id: optionIds.Adobo,
          quantity: 1,
        }],
      },
    });
    assert.equal(sold.status, 201);

    const kitchen = await call('GET', '/api/kitchen/orders', { tok });
    const ticket = kitchen.body.data.find((o) => o.id === sold.body.id);
    assert.ok(ticket, 'the new order should appear on a kitchen ticket');
    assert.equal(ticket.order_items[0].option.name, 'Solo');
    assert.equal(ticket.order_items[0].flavor.name, 'Adobo');

    await db.query('DELETE FROM orders WHERE id = $1', [sold.body.id]);
  });
});
