/**
 * Tests for category↔variant-group linking (migrations 019–020): a variant
 * group is a name + max option count, categories toggle which groups they
 * offer, and option names/prices are stored per menu item on
 * `menu_item_variants`.
 *
 * Covered:
 *
 *   1. PUT /api/admin/system-settings/menu-categories/:id/variants replaces the
 *      linked set; GET listCategories exposes `variant_group_ids`.
 *   2. Menu items accept grouped variants `[{ group_id, name, price }]`
 *      (+ `variants_mode: 'group'`) and the API returns the group names.
 *   3. Validation: groups not enabled for the category, non-positive prices,
 *      missing names, duplicate names within a group, and exceeding a group's
 *      max_options are all refused (400).
 *   4. Editing an item fully replaces its grouped rows; an empty group-mode
 *      payload clears them all.
 *   5. Option names/prices are per item — two items may differ.
 *   6. Toggling a group OFF deletes that group's item variants in the category.
 *   7. Deleting a variant group cascades to links and item variants.
 *   8. Legacy flat variants (`variant_group_id IS NULL`) still work.
 *
 * Every test creates and removes its own category, group and menu items.
 * Database-backed tests are skipped when no database is reachable.
 *
 * Run with: npm test
 */

const test = require('node:test');
const { before, after } = require('node:test');
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
  app.use('/api/admin/system-settings', require('../src/modules/admin/admin.settings.routes'));
  app.use('/api/menu', require('../src/modules/menu/menu.routes'));
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

const uniqueName = (tag) => `zz_cv_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e4)}`;

const createCategory = async (tag) => {
  const res = await call('POST', '/api/admin/system-settings/menu-categories', {
    body: { name: uniqueName(tag) },
  });
  assert.equal(res.status, 201);
  return res.body.data;
};

const deleteCategoryDirect = async (id) => {
  await db.query('DELETE FROM menu_categories WHERE id = $1', [id]);
};

const createGroup = async (tag, maxOptions = 3) => {
  const res = await call('POST', '/api/admin/system-settings/variants', {
    body: { name: uniqueName(tag), max_options: maxOptions },
  });
  assert.equal(res.status, 201);
  return res.body.data;
};

const deleteGroupDirect = async (id) => {
  await db.query('DELETE FROM variant_groups WHERE id = $1', [id]);
};

const linkCategory = async (categoryId, groupIds) => {
  const res = await call('PUT', `/api/admin/system-settings/menu-categories/${categoryId}/variants`, {
    body: { group_ids: groupIds },
  });
  assert.equal(res.status, 200);
  return res.body.data;
};

const createItem = async (payload) => {
  const res = await call('POST', '/api/menu', { body: payload });
  assert.equal(res.status, 201, `create item failed: ${res.body?.message}`);
  return res.body;
};

const deleteItemDirect = async (id) => {
  await db.query('DELETE FROM menu_items WHERE id = $1', [id]);
};

const variantRows = async (menuItemId) =>
  (await db.query(
    `SELECT id, name, price, variant_group_id
       FROM menu_item_variants
      WHERE menu_item_id = $1
      ORDER BY display_order, id`,
    [menuItemId])).rows;

const linkedGroups = async (categoryId) =>
  (await db.query(
    'SELECT variant_group_id FROM menu_category_variant_groups WHERE category_id = $1 ORDER BY variant_group_id',
    [categoryId])).rows.map(r => r.variant_group_id);

// The admin endpoints write audit_log rows; drop everything this file appends
// so the database (and the regenerated schema dump) stays free of test residue.
let auditMark = 0;

before(async () => {
  if (!(await canQuery())) return;
  const { rows } = await db.query('SELECT COALESCE(MAX(id), 0) AS max FROM audit_log');
  auditMark = Number(rows[0].max);
});

after(async () => {
  if (!db || !auditMark) return;
  await db.query('DELETE FROM audit_log WHERE id > $1', [auditMark]);
});

// ─── 1–3. Toggle on, item create, validation ─────────────────────────────────

test('category toggles groups; items define per-item option names and prices', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');

  const cat = await createCategory('cat');
  const group = await createGroup('grp', 3);
  const other = await createGroup('other', 3);
  let itemId = null;

  try {
    // 1. Toggling ON stores the link; listCategories exposes the ids.
    const linked = await linkCategory(cat.id, [group.id]);
    assert.deepEqual(linked.variant_group_ids, [group.id]);

    const list = await call('GET', '/api/admin/system-settings/menu-categories');
    const listed = list.body.data.find(c => c.id === cat.id);
    assert.ok(Array.isArray(listed.variant_group_ids), 'listCategories must expose variant_group_ids');
    assert.ok(listed.variant_group_ids.includes(group.id));

    // 2. Create an item with its own option names/prices for the group.
    const item = await createItem({
      name: uniqueName('item'),
      price: 100,
      category_id: cat.id,
      variants_mode: 'group',
      variants: [
        { group_id: group.id, name: 'Chocolate', price: 90 },
        { group_id: group.id, name: 'Vanilla', price: 95 },
      ],
    });
    itemId = item.id;

    assert.equal(item.variants.length, 2);
    assert.equal(item.variants[0].group_id, group.id);
    assert.equal(item.variants[0].group_name, group.name);
    assert.equal(item.variants[0].name, 'Chocolate');
    assert.equal(Number(item.variants[0].price), 90);
    assert.equal(item.variants[1].name, 'Vanilla');

    const rows = await variantRows(itemId);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].variant_group_id, group.id);
    assert.equal(rows[0].name, 'Chocolate');
    assert.equal(Number(rows[0].price), 90);

    // 3a. A group not enabled for this category is refused.
    const unlinked = await call('POST', '/api/menu', {
      body: {
        name: uniqueName('bad'),
        price: 50,
        category_id: cat.id,
        variants_mode: 'group',
        variants: [{ group_id: other.id, name: 'Solo', price: 60 }],
      },
    });
    assert.equal(unlinked.status, 400);
    assert.match(unlinked.body.message, /not enabled for this category/i);

    // 3b. Non-positive prices are refused.
    const badPrice = await call('POST', '/api/menu', {
      body: {
        name: uniqueName('bad'),
        price: 50,
        category_id: cat.id,
        variants_mode: 'group',
        variants: [{ group_id: group.id, name: 'Free', price: 0 }],
      },
    });
    assert.equal(badPrice.status, 400);
    assert.match(badPrice.body.message, /price greater than zero/i);

    // 3c. Missing names are refused.
    const noName = await call('POST', '/api/menu', {
      body: {
        name: uniqueName('bad'),
        price: 50,
        category_id: cat.id,
        variants_mode: 'group',
        variants: [{ group_id: group.id, name: '   ', price: 10 }],
      },
    });
    assert.equal(noName.status, 400);
    assert.match(noName.body.message, /needs a name/i);

    // 3d. Duplicate names within a group are refused (case-insensitive).
    const dupe = await call('POST', '/api/menu', {
      body: {
        name: uniqueName('bad'),
        price: 50,
        category_id: cat.id,
        variants_mode: 'group',
        variants: [
          { group_id: group.id, name: 'Big', price: 10 },
          { group_id: group.id, name: 'BIG', price: 20 },
        ],
      },
    });
    assert.equal(dupe.status, 400);
    assert.match(dupe.body.message, /Duplicate option name/i);

    // 3e. Exceeding the group's max_options is refused.
    const tiny = await createGroup('tiny', 1);
    await linkCategory(cat.id, [group.id, tiny.id]);
    const overMax = await call('POST', '/api/menu', {
      body: {
        name: uniqueName('bad'),
        price: 50,
        category_id: cat.id,
        variants_mode: 'group',
        variants: [
          { group_id: tiny.id, name: 'One', price: 10 },
          { group_id: tiny.id, name: 'Two', price: 20 },
        ],
      },
    });
    assert.equal(overMax.status, 400);
    assert.match(overMax.body.message, /allows up to 1 option/i);
    await linkCategory(cat.id, [group.id]);
    await call('DELETE', `/api/admin/system-settings/variants/${tiny.id}`);
  } finally {
    if (itemId) await deleteItemDirect(itemId);
    await deleteGroupDirect(group.id);
    await deleteGroupDirect(other.id);
    await deleteCategoryDirect(cat.id);
  }
});

// ─── 4–5. Editing + per-item options ─────────────────────────────────────────

test('group-mode edit fully replaces rows; empty payload clears; names are per item', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');

  const cat = await createCategory('cat');
  const group = await createGroup('grp', 3);
  let itemA = null;
  let itemB = null;

  try {
    await linkCategory(cat.id, [group.id]);
    itemA = (await createItem({
      name: uniqueName('item_a'),
      price: 100,
      category_id: cat.id,
      variants_mode: 'group',
      variants: [
        { group_id: group.id, name: 'Small', price: 90 },
        { group_id: group.id, name: 'Large', price: 120 },
      ],
    })).id;
    itemB = (await createItem({
      name: uniqueName('item_b'),
      price: 100,
      category_id: cat.id,
      variants_mode: 'group',
      variants: [
        { group_id: group.id, name: 'Chocolate', price: 110 },
        { group_id: group.id, name: 'Vanilla', price: 115 },
      ],
    })).id;

    // 5. Two items in the same category/group can use different option names.
    const rowsA = await variantRows(itemA);
    const rowsB = await variantRows(itemB);
    assert.deepEqual(rowsA.map(r => r.name), ['Small', 'Large']);
    assert.deepEqual(rowsB.map(r => r.name), ['Chocolate', 'Vanilla']);

    // 4a. Editing replaces row names/prices (drop "Large", rename "Small").
    const edited = await call('PUT', `/api/menu/${itemA}`, {
      body: {
        variants_mode: 'group',
        variants: [{ group_id: group.id, name: 'Petite', price: 99 }],
      },
    });
    assert.equal(edited.status, 200, `edit failed: ${edited.body?.message}`);
    assert.equal(edited.body.variants.length, 1);
    assert.equal(edited.body.variants[0].name, 'Petite');
    assert.equal(Number(edited.body.variants[0].price), 99);

    const rowsAfter = await variantRows(itemA);
    assert.equal(rowsAfter.length, 1, 'only the submitted rows remain');
    assert.equal(rowsAfter[0].name, 'Petite');

    // 4b. An empty group-mode payload clears every grouped row.
    const cleared = await call('PUT', `/api/menu/${itemA}`, {
      body: { variants_mode: 'group', variants: [] },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.variants.length, 0);
    assert.equal((await variantRows(itemA)).length, 0);

    // 4c. Editing the item without a variants payload keeps grouped rows.
    await call('PUT', `/api/menu/${itemB}`, {
      body: { name: uniqueName('renamed') },
    });
    assert.equal((await variantRows(itemB)).length, 2, 'variants survive an edit without a variants payload');
  } finally {
    if (itemA) await deleteItemDirect(itemA);
    if (itemB) await deleteItemDirect(itemB);
    await deleteGroupDirect(group.id);
    await deleteCategoryDirect(cat.id);
  }
});

// ─── 6. Toggle off deletes item variants ─────────────────────────────────────

test('toggling a group OFF deletes its item variants in the category', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');

  const cat = await createCategory('cat');
  const group = await createGroup('grp', 3);
  const other = await createGroup('other', 3);
  let itemId = null;

  try {
    await linkCategory(cat.id, [group.id, other.id]);
    const item = await createItem({
      name: uniqueName('item'),
      price: 100,
      category_id: cat.id,
      variants_mode: 'group',
      variants: [
        { group_id: group.id, name: 'Chocolate', price: 90 },
        { group_id: other.id, name: 'Solo', price: 80 },
      ],
    });
    itemId = item.id;
    assert.equal((await variantRows(itemId)).length, 2);

    // Toggle the other group off — its row must vanish, the first group stays.
    const updated = await linkCategory(cat.id, [group.id]);
    assert.deepEqual(updated.variant_group_ids, [group.id]);

    const rows = await variantRows(itemId);
    assert.equal(rows.length, 1, 'only the removed group variants are deleted');
    assert.equal(rows[0].variant_group_id, group.id);
    assert.equal(Number(rows[0].price), 90, 'remaining group variant keeps its price');
    assert.deepEqual(await linkedGroups(cat.id), [group.id]);
  } finally {
    if (itemId) await deleteItemDirect(itemId);
    await deleteGroupDirect(group.id);
    await deleteGroupDirect(other.id);
    await deleteCategoryDirect(cat.id);
  }
});

// ─── 7. Group delete cascades ────────────────────────────────────────────────

test('deleting a variant group removes its links and item variants', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');

  const cat = await createCategory('cat');
  const group = await createGroup('grp', 3);
  let itemId = null;

  try {
    await linkCategory(cat.id, [group.id]);
    const item = await createItem({
      name: uniqueName('item'),
      price: 100,
      category_id: cat.id,
      variants_mode: 'group',
      variants: [{ group_id: group.id, name: 'Chocolate', price: 90 }],
    });
    itemId = item.id;

    const deleted = await call('DELETE', `/api/admin/system-settings/variants/${group.id}`);
    assert.equal(deleted.status, 200, `delete failed: ${deleted.body?.message}`);

    assert.deepEqual(await linkedGroups(cat.id), [], 'links must cascade');
    assert.equal((await variantRows(itemId)).length, 0, 'item variants must cascade');
  } finally {
    if (itemId) await deleteItemDirect(itemId);
    await deleteCategoryDirect(cat.id);
  }
});

// ─── 8. Legacy flat variants still work ──────────────────────────────────────

test('legacy flat variants (no group) still create and update', async (t) => {
  if (!(await canQuery())) return t.skip('no database');
  if (!(await signIn('admin'))) return t.skip('no active admin account');

  const cat = await createCategory('cat');
  let itemId = null;

  try {
    const item = await createItem({
      name: uniqueName('item'),
      price: 100,
      category_id: cat.id,
      variants: [{ name: 'Regular', price: 100 }, { name: 'Large', price: 130 }],
    });
    itemId = item.id;

    const rows = await variantRows(itemId);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.variant_group_id === null));
    assert.deepEqual(rows.map(r => r.name), ['Regular', 'Large']);

    // Legacy edit still diffs by id.
    const edited = await call('PUT', `/api/menu/${itemId}`, {
      body: { variants: [{ id: rows[0].id, name: 'Regular', price: 105 }] },
    });
    assert.equal(edited.status, 200, `legacy edit failed: ${edited.body?.message}`);
    const rowsAfter = await variantRows(itemId);
    assert.equal(rowsAfter.length, 1);
    assert.equal(Number(rowsAfter[0].price), 105);
  } finally {
    if (itemId) await deleteItemDirect(itemId);
    await deleteCategoryDirect(cat.id);
  }
});
