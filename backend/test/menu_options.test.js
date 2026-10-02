/**
 * Menu item options / variants -- the "Coffee is Hot or Iced, and they cost
 * different amounts" case (migration 008).
 *
 * The rule under test throughout: the amount charged comes from the option
 * row, never from the client and never from menu_items.price when options
 * exist. Two menus pointing at one item is only correct if every path that
 * prices a sale reads the variant it was actually told to sell.
 *
 * Covered:
 *   1. Staff can add options with their own absolute prices.
 *   2. Options ride along with the item in the public and staff menus, so the
 *      cashier UI needs no extra request.
 *   3. An order for an item that has options is REJECTED without one. Silently
 *      falling back to the item price would sell Iced at the Hot price -- the
 *      exact bug this feature exists to prevent.
 *   4. An order with an option is charged the option's price, and the option
 *      is recorded on the order line.
 *   5. A client-supplied unit_price is ignored.
 *   6. An option id belonging to a different item is rejected.
 *   7. An archived option cannot be ordered, but the old receipt still names
 *      it -- the ordering constraint as a new column.
 *   8. The kitchen ticket shows the variant.
 *   9. Item price edits leave option prices alone (they are authoritative).
 *
 * Database-backed tests skip when no database is reachable.
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
 * A menu item priced at `price` carrying `options` ([{ name, price }]), plus
 * an optional already-placed order. Cleanup removes orders before the item,
 * because order_items holds hard FKs to both menu_items and options.
 */
const withVariedItem = async ({ price = 50, options = [], order = null }, fn) => {
  const cat = (await db.query(`SELECT id FROM menu_categories ORDER BY id LIMIT 1`)).rows[0];
  const created = await db.query(
    `INSERT INTO menu_items (category_id, name, description, price)
     VALUES ($1, $2, 'tmp', $3) RETURNING id`,
    [cat.id, `tmp-variant-${uniq()}`, price]
  );
  const itemId = created.rows[0].id;

  const optionIds = {};
  for (const opt of options) {
    const o = await db.query(
      `INSERT INTO menu_item_options (menu_item_id, name, price, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [itemId, opt.name, opt.price, options.indexOf(opt)]
    );
    optionIds[opt.name] = o.rows[0].id;
  }

  let orderId = null;
  if (order) {
    const ins = await db.query(
      `INSERT INTO orders (order_type, status, order_channel, total_amount)
       VALUES ('counter', 'pending', 'web_counter', $1) RETURNING id`,
      [order.unit_price * (order.quantity || 1)]
    );
    orderId = ins.rows[0].id;
    await db.query(
      `INSERT INTO order_items (order_id, menu_item_id, menu_item_option_id, quantity, unit_price)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, itemId, order.optionId ?? null, order.quantity || 1, order.unit_price]
    );
  }

  try {
    return await fn({ itemId, optionIds, orderId });
  } finally {
    if (orderId) await db.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
    await db.query(`DELETE FROM menu_items WHERE id = $1`, [itemId]);
  }
};

const HOT = { name: 'Hot', price: 50 };
const ICED = { name: 'Iced', price: 55 };

test('staff can add options with their own absolute prices', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [] }, async ({ itemId }) => {
    const made = await call('POST', `/api/menu/${itemId}/options`, {
      tok, body: { name: 'Iced', price: 55 },
    });
    assert.equal(made.status, 201);
    assert.equal(made.body.name, 'Iced');
    assert.equal(made.body.price, 55, 'price must come back as a number, not "55.00"');

    const dup = await call('POST', `/api/menu/${itemId}/options`, {
      tok, body: { name: 'Iced', price: 60 },
    });
    assert.equal(dup.status, 409, 'a duplicate option name must be a readable 409');
  });
});

test('options come back with the item in the public and staff menus', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId }) => {
    for (const path of ['/api/menu', '/api/menu/staff']) {
      const res = await call('GET', path, { tok });
      const found = res.body.items.find((i) => i.id === itemId);
      assert.ok(found, `${path} should include the item`);
      assert.equal(found.options.length, 2, `${path} should carry both options`);
      assert.deepEqual(
        found.options.map((o) => o.name).sort(),
        ['Hot', 'Iced'],
        `${path} should list both variant names`
      );
      assert.deepEqual(
        found.options.map((o) => o.price).sort((a, b) => a - b),
        [50, 55],
        `${path} should carry each variant's own price`
      );
    }
  });
});

test('ordering an item that has options is rejected without one', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId }) => {
    const res = await call('POST', '/api/orders', {
      tok, body: { items: [{ menu_item_id: itemId, quantity: 1 }] },
    });
    assert.equal(res.status, 400, 'a variant-bearing item must not be orderable without a variant');
    assert.match(res.body.message, /needs an option/i);
    assert.match(res.body.message, /Hot or Iced/, 'the error should name the choices');
  });
});

test('an order with an option is charged the option price', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId, optionIds }) => {
    const res = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_option_id: optionIds.Iced, quantity: 2 }] },
    });
    assert.equal(res.status, 201);
    // 2 x 55, not 2 x 50 -- the whole point of the feature.
    assert.equal(res.body.total_amount, 110);
    assert.equal(res.body.items[0].unit_price, 55);
    assert.equal(res.body.items[0].option_name, 'Iced');

    const row = await db.query(
      'SELECT menu_item_option_id, unit_price FROM order_items WHERE order_id = $1',
      [res.body.id]
    );
    assert.equal(row.rows[0].menu_item_option_id, optionIds.Iced,
      'the sold variant must be recorded on the order line');
    assert.equal(Number(row.rows[0].unit_price), 55);

    // The pending payment row has to agree with the order total.
    const pay = await db.query('SELECT amount FROM payments WHERE order_id = $1', [res.body.id]);
    assert.equal(Number(pay.rows[0].amount), 110,
      'payments.amount must match the variant price, not the base price');

    await db.query('DELETE FROM orders WHERE id = $1', [res.body.id]);
  });
});

test('a client-supplied unit_price is ignored', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId, optionIds }) => {
    const res = await call('POST', '/api/orders', {
      tok,
      body: {
        items: [{
          menu_item_id: itemId,
          menu_item_option_id: optionIds.Iced,
          quantity: 1,
          unit_price: 1, // tampered: pricing must come from the database
        }],
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.total_amount, 55, 'the tampered price must be discarded');
    await db.query('DELETE FROM orders WHERE id = $1', [res.body.id]);
  });
});

test("an option id from another item is rejected", { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId }) => {
    await withVariedItem({ price: 70, options: [{ name: 'Large', price: 90 }] }, async ({ optionIds: other }) => {
      const res = await call('POST', '/api/orders', {
        tok,
        body: { items: [{ menu_item_id: itemId, menu_item_option_id: other.Large, quantity: 1 }] },
      });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /does not belong/i);
    });
  });
});

test('archiving an option stops new orders but keeps the old receipt readable', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_option_id: optionIds.Iced, quantity: 1 }] },
    });
    assert.equal(sold.status, 201);

    const archived = await call('DELETE', `/api/menu/${itemId}/options/${optionIds.Iced}`, { tok });
    assert.equal(archived.status, 200);

    // Gone from the menu payload.
    const pub = await call('GET', '/api/menu', { tok });
    const found = pub.body.items.find((i) => i.id === itemId);
    assert.ok(!found.options.some((o) => o.name === 'Iced'), 'archived option must not be offered');

    // Cannot be ordered any more.
    const retry = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_option_id: optionIds.Iced, quantity: 1 }] },
    });
    assert.equal(retry.status, 400);

    // But the historical line still resolves to a name -- the reason options
    // are archived rather than deleted.
    const hist = await db.query(
      `SELECT mio.name, oi.unit_price
         FROM order_items oi
         LEFT JOIN menu_item_options mio ON mio.id = oi.menu_item_option_id
        WHERE oi.order_id = $1`,
      [sold.body.id]
    );
    assert.equal(hist.rows[0].name, 'Iced');
    assert.equal(Number(hist.rows[0].unit_price), 55);

    await db.query('DELETE FROM orders WHERE id = $1', [sold.body.id]);
  });
});

test('the kitchen ticket shows the variant', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_option_id: optionIds.Iced, quantity: 1 }] },
    });
    assert.equal(sold.status, 201);

    const kitchen = await call('GET', '/api/kitchen/orders', { tok });
    const ticket = kitchen.body.data.find((o) => o.id === sold.body.id);
    assert.ok(ticket, 'the new order should appear on a kitchen ticket');
    assert.equal(ticket.order_items[0].option.name, 'Iced',
      'the kitchen must be able to tell which variant to make');

    await db.query('DELETE FROM orders WHERE id = $1', [sold.body.id]);
  });
});

test('editing the item price leaves option prices alone', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId, optionIds }) => {
    // Re-pricing the parent must not silently re-price the variants: the
    // option rows are what every sale is charged from.
    const res = await call('PUT', `/api/menu/${itemId}`, { tok, body: { price: 60 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.price, 60);

    const opts = await db.query(
      'SELECT name, price FROM menu_item_options WHERE id = ANY($1::int[]) ORDER BY name',
      [[optionIds.Hot, optionIds.Iced]]
    );
    assert.deepEqual(
      opts.rows.map((r) => [r.name, Number(r.price)]),
      [['Hot', 50], ['Iced', 55]],
      'option prices must be independent of menu_items.price'
    );
  });
});

test('an item with no options still prices normally', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 75, options: [] }, async ({ itemId }) => {
    const res = await call('POST', '/api/orders', {
      tok, body: { items: [{ menu_item_id: itemId, quantity: 3 }] },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.total_amount, 225, 'optionless items must be unaffected');
    assert.equal(res.body.items[0].menu_item_option_id, null);
    await db.query('DELETE FROM orders WHERE id = $1', [res.body.id]);
  });
});

test('an item can be created with its options in one call', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  // Regression: the staff modal saves the item and its variants together, and
  // this path had an INSERT naming five columns while supplying four values, so
  // every save from the modal failed with "INSERT has more target columns than
  // expressions". The per-option tests missed it because they inserted options
  // with their own SQL.
  const cat = (await db.query(`SELECT id FROM menu_categories ORDER BY id LIMIT 1`)).rows[0];
  const res = await call('POST', '/api/menu', {
    tok,
    body: {
      name: `tmp-variant-${uniq()}`,
      price: 50,
      category_id: cat.id,
      options: [
        { name: 'Hot', price: 50 },
        { name: 'Iced', price: 55 },
        { name: 'Iced de Leche', price: 65 },
      ],
    },
  });

  try {
    assert.equal(res.status, 201);
    assert.equal(res.body.options.length, 3);
    assert.deepEqual(
      res.body.options.map((o) => [o.name, o.price]),
      [['Hot', 50], ['Iced', 55], ['Iced de Leche', 65]],
      'options must come back in the order they were submitted'
    );
  } finally {
    await db.query(`DELETE FROM menu_items WHERE id = $1`, [res.body?.id]);
  }
});

test('an item update can rewrite its options in one call', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId, optionIds }) => {
    // Same shape the modal sends: the retained row keeps its id, one is new.
    const res = await call('PUT', `/api/menu/${itemId}`, {
      tok,
      body: {
        options: [
          { id: optionIds.Hot, name: 'Hot', price: 52 },
          { name: 'Extra Hot', price: 54 },
        ],
      },
    });
    assert.equal(res.status, 200);

    const kept = await db.query(
      `SELECT id, name, price FROM menu_item_options
        WHERE menu_item_id = $1 AND archived_at IS NULL ORDER BY sort_order, name`,
      [itemId]
    );
    assert.deepEqual(
      kept.rows.map((r) => [r.name, Number(r.price)]),
      [['Extra Hot', 54], ['Hot', 52]],
      'Hot is re-priced in place, Extra Hot is added, Iced is withdrawn'
    );
    // Hot kept its identity, which is what keeps sold receipts pointing at the
    // right row instead of at a freshly created twin.
    assert.equal(kept.rows.find((r) => r.name === 'Hot').id, optionIds.Hot);

    const gone = await db.query(
      'SELECT archived_at FROM menu_item_options WHERE id = $1',
      [optionIds.Iced]
    );
    assert.ok(gone.rows[0].archived_at, 'the dropped option is archived, not erased');
  });
});

test("re-pricing an option that has already been sold works", { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  // The bug this guards: options were once replaced by delete-then-insert.
  // order_items holds a hard FK to menu_item_options(id), so deleting an option
  // that appears in a past order raised FK 23503 and the whole save returned a
  // bare 500 -- meaning a cafe could never change a price after selling the
  // drink once.
  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId, optionIds }) => {
    const sold = await call('POST', '/api/orders', {
      tok,
      body: { items: [{ menu_item_id: itemId, menu_item_option_id: optionIds.Iced, quantity: 1 }] },
    });
    assert.equal(sold.status, 201);

    const res = await call('PUT', `/api/menu/${itemId}`, {
      tok,
      body: {
        options: [
          { id: optionIds.Hot, name: 'Hot', price: 50 },
          { id: optionIds.Iced, name: 'Iced', price: 60 },
        ],
      },
    });
    assert.equal(res.status, 200, 'raising a price on a sold variant must not fail');

    // The past order keeps its own recorded price and still resolves.
    const hist = await db.query(
      `SELECT oi.unit_price, mo.name, mo.price
         FROM order_items oi
         LEFT JOIN menu_item_options mo ON mo.id = oi.menu_item_option_id
        WHERE oi.order_id = $1`,
      [sold.body.id]
    );
    assert.equal(Number(hist.rows[0].unit_price), 55, 'the old sale keeps what it was sold for');
    assert.equal(hist.rows[0].name, 'Iced');
    assert.equal(Number(hist.rows[0].price), 60, 'the variant itself now costs 60');

    await db.query('DELETE FROM orders WHERE id = $1', [sold.body.id]);
  });
});

test('an item update does not wipe options when the field is omitted', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const staff = await staffAccount();
  if (!staff) return t.skip('no active staff account');
  const tok = signFor(staff.id, 'staff');

  await withVariedItem({ price: 50, options: [HOT, ICED] }, async ({ itemId }) => {
    // A price-only edit, e.g. a keyboard shortcut elsewhere in the page.
    const res = await call('PUT', `/api/menu/${itemId}`, { tok, body: { price: 99 } });
    assert.equal(res.status, 200);

    const left = await db.query(
      'SELECT name FROM menu_item_options WHERE menu_item_id = $1 AND archived_at IS NULL',
      [itemId]
    );
    assert.equal(left.rows.length, 2, 'options must survive a partial update');
  });
});

test('a cashier cannot add options', { skip }, async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const cashier = (await db.query(
    `SELECT id FROM staff_accounts WHERE role = 'cashier' AND status = 'active' ORDER BY id LIMIT 1`
  )).rows[0];
  if (!cashier) return t.skip('no active cashier account');

  await withVariedItem({ price: 50, options: [] }, async ({ itemId }) => {
    const res = await call('POST', `/api/menu/${itemId}/options`, {
      tok: signFor(cashier.id, 'cashier'), body: { name: 'Iced', price: 55 },
    });
    assert.notEqual(res.status, 201, 'a cashier must not be able to change the menu');
  });
});