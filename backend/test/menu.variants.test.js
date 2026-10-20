/**
 * Tests for menu-item variants (migration 017) across the menu and ordering
 * APIs:
 *
 *   1. Creating an item with variants persists them in display order and the
 *      public menu exposes them.
 *   2. Variant payload validation (empty/over-long/duplicate names, prices).
 *   3. `PUT /api/menu/:id` diffs variants by id — updates, inserts, deletes —
 *      and refuses foreign ids.
 *   4. Placing an order requires picking a variant when the item has one:
 *      missing / foreign / unavailable variants are refused, a valid pick is
 *      snapshotted onto `order_items` (variant_id + variant_name), and the
 *      kitchen endpoint composes "Name – Variant".
 *
 * The database-backed tests are skipped when no database is reachable. Every
 * test removes the items, variants and orders it created.
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

// ─── HTTP harness ─────────────────────────────────────────────────────────────

const tokens = {};

const signIn = async (role = 'admin') => {
  if (tokens[role]) return tokens[role];
  const account = await db.query(
    `SELECT id FROM staff_accounts WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`,
    [role]);
  if (account.rowCount === 0) return null;
  const jwt = require('jsonwebtoken');
  tokens[role] = jwt.sign(
    { sub: account.rows[0].id, type: 'staff', role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' },
  );
  return tokens[role];
};

/**
 * Bare Express app around the real routers. Deliberately not `server.js`:
 * that binds a port, opens Socket.io and installs a startup rate limit.
 */
function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/menu', require('../src/modules/menu/menu.routes'));
  app.use('/api/orders', require('../src/modules/orders/orders.routes'));
  app.use('/api/kitchen', require('../src/modules/kitchen/kitchen.routes'));
  return app;
}

async function call(method, path, { body, role = 'admin', token } = {}) {
  const jwtToken = token || (await signIn(role));
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uniqueName = (tag) => `zz_var_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;

const firstCategoryId = async () =>
  (await db.query('SELECT id FROM menu_categories ORDER BY id LIMIT 1')).rows[0]?.id ?? null;

const deleteItemDirect = async (id) => {
  await db.query('DELETE FROM menu_items WHERE id = $1', [id]);
};

const variantRows = async (menuItemId) =>
  (await db.query(
    `SELECT id, name, price, is_available FROM menu_item_variants
     WHERE menu_item_id = $1 ORDER BY display_order, id`,
    [menuItemId])).rows;

// ─── 1. Create ────────────────────────────────────────────────────────────────

test('create persists variants in display order and the public menu exposes them', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');
  const categoryId = await firstCategoryId();
  if (!categoryId) return t.skip('no menu category');

  let itemId = null;
  try {
    const name = uniqueName('create');
    const created = await call('POST', '/api/menu', {
      body: {
        name,
        price: 100,
        category_id: categoryId,
        variants: [
          { name: 'Small', price: 80 },
          { name: 'Large', price: 120 },
        ],
      },
    });
    assert.equal(created.status, 201);
    itemId = created.body.id;

    assert.equal(created.body.variants.length, 2);
    assert.deepEqual(created.body.variants.map((v) => v.name), ['Small', 'Large']);
    assert.equal(created.body.variants[0].price, 80);
    assert.ok(created.body.variants[0].id, 'each variant must get an id');

    const publicMenu = await call('GET', '/api/menu', { token: 'public' });
    const exposed = publicMenu.body.items.find((i) => i.id === itemId);
    assert.ok(exposed, 'new item must appear on the public menu');
    assert.equal(exposed.variants.length, 2, 'public menu must expose variants');
    assert.deepEqual(exposed.variants.map((v) => v.name), ['Small', 'Large']);
  } finally {
    if (itemId !== null) await deleteItemDirect(itemId);
  }
});

// ─── 2. Validation ────────────────────────────────────────────────────────────

test('variant payload validation rejects bad input', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');
  const categoryId = await firstCategoryId();
  if (!categoryId) return t.skip('no menu category');

  const base = { name: uniqueName('valid'), price: 100, category_id: categoryId };

  const empty = await call('POST', '/api/menu', {
    body: { ...base, variants: [{ name: '  ', price: 10 }] },
  });
  assert.equal(empty.status, 400);
  assert.match(empty.body.message, /needs a name/i);

  const long = await call('POST', '/api/menu', {
    body: { ...base, variants: [{ name: 'x'.repeat(101), price: 10 }] },
  });
  assert.equal(long.status, 400);
  assert.match(long.body.message, /100 characters/i);

  const zeroPrice = await call('POST', '/api/menu', {
    body: { ...base, variants: [{ name: 'Small', price: 0 }] },
  });
  assert.equal(zeroPrice.status, 400);
  assert.match(zeroPrice.body.message, /price greater than zero/i);

  const duplicate = await call('POST', '/api/menu', {
    body: { ...base, variants: [{ name: 'Large', price: 10 }, { name: 'LARGE', price: 20 }] },
  });
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.message, /Duplicate variant name/i);

  // None of the rejected requests may have created an item.
  const orphans = await db.query('SELECT COUNT(*)::int AS n FROM menu_items WHERE name = $1', [base.name]);
  assert.equal(orphans.rows[0].n, 0, 'rejected payloads must not persist an item');
});

// ─── 3. Update diff-by-id ─────────────────────────────────────────────────────

test('update diffs variants by id: updates, inserts, deletes', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');
  const categoryId = await firstCategoryId();
  if (!categoryId) return t.skip('no menu category');

  let itemId = null;
  try {
    const created = await call('POST', '/api/menu', {
      body: {
        name: uniqueName('diff'),
        price: 100,
        category_id: categoryId,
        variants: [
          { name: 'A', price: 10 },
          { name: 'B', price: 20 },
        ],
      },
    });
    assert.equal(created.status, 201);
    itemId = created.body.id;
    const [variantA, variantB] = created.body.variants;

    const updated = await call('PUT', `/api/menu/${itemId}`, {
      body: {
        variants: [
          { id: variantA.id, name: 'A large', price: 90 },
          { name: 'C', price: 150 },
        ],
      },
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.variants.map((v) => v.name), ['A large', 'C']);
    assert.equal(updated.body.variants[0].id, variantA.id, 'existing variant keeps its id');
    assert.equal(updated.body.variants[0].price, 90);

    const rows = await variantRows(itemId);
    assert.equal(rows.length, 2, 'dropped variant must be hard-deleted');
    const goneB = await db.query('SELECT COUNT(*)::int AS n FROM menu_item_variants WHERE id = $1', [variantB.id]);
    assert.equal(goneB.rows[0].n, 0, 'variant B must be gone');

    const foreign = await call('PUT', `/api/menu/${itemId}`, {
      body: { variants: [{ id: 999999999, name: 'X', price: 10 }] },
    });
    assert.equal(foreign.status, 400);
    assert.match(foreign.body.message, /does not belong to this menu item/i);
  } finally {
    if (itemId !== null) await deleteItemDirect(itemId);
  }
});

// ─── 4. Ordering ──────────────────────────────────────────────────────────────

test('orders require picking a variant, and the pick is snapshotted', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');
  const categoryId = await firstCategoryId();
  if (!categoryId) return t.skip('no menu category');

  let itemId = null;
  let otherId = null;
  let orderId = null;
  try {
    const name = uniqueName('order');
    const created = await call('POST', '/api/menu', {
      body: {
        name,
        price: 100,
        category_id: categoryId,
        variants: [
          { name: 'Small', price: 80 },
          { name: 'Large', price: 120, is_available: false },
        ],
      },
    });
    assert.equal(created.status, 201);
    itemId = created.body.id;
    const [small, large] = created.body.variants;

    const other = await call('POST', '/api/menu', {
      body: {
        name: uniqueName('other'),
        price: 50,
        category_id: categoryId,
        variants: [{ name: 'Only', price: 50 }],
      },
    });
    assert.equal(other.status, 201);
    otherId = other.body.id;
    const foreignVariantId = other.body.variants[0].id;

    const orderBody = (items) => ({
      order_type: 'counter',
      items,
      payment: { method: 'cash', cash_given: 500 },
    });

    const missing = await call('POST', '/api/orders', {
      body: orderBody([{ menu_item_id: itemId, quantity: 1 }]),
    });
    assert.equal(missing.status, 400);
    assert.match(missing.body.message, /has variants — pick one/i);

    const foreign = await call('POST', '/api/orders', {
      body: orderBody([{ menu_item_id: itemId, variant_id: foreignVariantId, quantity: 1 }]),
    });
    assert.equal(foreign.status, 400);
    assert.match(foreign.body.message, /does not belong to/i);

    const unavailable = await call('POST', '/api/orders', {
      body: orderBody([{ menu_item_id: itemId, variant_id: large.id, quantity: 1 }]),
    });
    assert.equal(unavailable.status, 400);
    assert.match(unavailable.body.message, /currently unavailable/i);

    const placed = await call('POST', '/api/orders', {
      body: orderBody([{ menu_item_id: itemId, variant_id: small.id, quantity: 2 }]),
    });
    assert.equal(placed.status, 201);
    orderId = placed.body.id;
    assert.equal(placed.body.total_amount, 160, 'total must use the variant price');
    assert.equal(placed.body.items[0].variant_name, 'Small');
    assert.equal(placed.body.items[0].unit_price, 80);

    const stored = await db.query(
      `SELECT variant_id, variant_name, unit_price FROM order_items WHERE order_id = $1`,
      [orderId]);
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].variant_id, small.id);
    assert.equal(stored.rows[0].variant_name, 'Small');
    assert.equal(Number(stored.rows[0].unit_price), 80);

    const kitchen = await call('GET', '/api/kitchen/orders', { role: 'kitchen_staff' });
    assert.equal(kitchen.status, 200);
    const card = (kitchen.body.data || []).find((o) => o.id === orderId);
    assert.ok(card, 'order must be in the kitchen queue');
    assert.equal(card.order_items[0].menu_item.name, `${name} – Small`);
  } finally {
    if (orderId !== null) {
      await db.query('DELETE FROM inventory_transactions WHERE reference_order_id = $1', [orderId]);
      await db.query('DELETE FROM orders WHERE id = $1', [orderId]);
    }
    if (itemId !== null) await deleteItemDirect(itemId);
    if (otherId !== null) await deleteItemDirect(otherId);
  }
});
