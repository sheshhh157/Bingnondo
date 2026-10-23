/**
 * Tests for menu item ratings & reviews (GET /api/menu/items/:id/reviews and
 * the avg_rating / review_count fields on the staff menu payload).
 *
 * Covered:
 *   1. Seeded reviews come back newest-first with numeric ratings.
 *   2. An item with no reviews returns an empty list (app degrades gracefully).
 *   3. A non-numeric id is rejected with 400.
 *   4. The staff menu exposes avg_rating + review_count per item.
 *
 * Database-backed tests are skipped when no database is reachable. Each test
 * builds its own throwaway item + reviews and removes them afterwards
 * (reviews cascade with the menu item, but we delete them explicitly first).
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// Signs a JWT for a throwaway customer (type='customer', sub = customers.id).
const signInCustomer = (customerId) =>
  require('jsonwebtoken').sign(
    { sub: customerId, type: 'customer' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  );

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/menu', require('../src/modules/menu/menu.routes'));
  return app;
}

async function call(method, path, { role = 'admin', body, rawToken } = {}) {
  const jwtToken = rawToken || (await signIn(role));
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let seq = 0;

async function createItem({ withReviews = 0 } = {}) {
  const suffix = `${Date.now()}_${seq++}`;
  const cat = await db.query('SELECT id FROM menu_categories ORDER BY id LIMIT 1');
  const item = await db.query(
    `INSERT INTO menu_items (category_id, name, price) VALUES ($1, $2, 10) RETURNING id`,
    [cat.rows[0].id, `__test_rated_${suffix}`]
  );
  const itemId = item.rows[0].id;

  // ratings 2,4,5 inserted oldest -> newest so newest-first ordering is testable.
  const ratings = [2, 4, 5].slice(0, withReviews);
  for (let i = 0; i < ratings.length; i++) {
    await db.query(
      `INSERT INTO menu_item_reviews (menu_item_id, customer_id, author_name, rating, comment, created_at)
       VALUES ($1, NULL, $2, $3, $4, NOW() - ($5 || ' days')::interval)`,
      [itemId, `__test_author_${i}`, ratings[i], `comment ${i}`, ratings.length - i]
    );
  }

  return { itemId };
}

async function cleanup(fx) {
  if (!fx) return;
  await db.query('DELETE FROM menu_item_reviews WHERE menu_item_id = $1', [fx.itemId]);
  await db.query('DELETE FROM menu_items WHERE id = $1', [fx.itemId]);
  if (fx.customerId) await db.query('DELETE FROM customers WHERE id = $1', [fx.customerId]);
}

// A throwaway customer account (unique email/mobile) for POST tests.
async function createCustomer() {
  const suffix = `${Date.now()}_${seq++}`;
  const c = await db.query(
    `INSERT INTO customers (email, password_hash, first_name, last_name, status)
     VALUES ($1, 'x', 'Test', 'Reviewer', 'active') RETURNING id`,
    [`__test_reviewer_${suffix}@example.com`]
  );
  return c.rows[0].id;
}

// ─── 1. Newest-first, numeric ratings ─────────────────────────────────────────

test('reviews come back newest-first with numeric ratings', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createItem({ withReviews: 3 });
  try {
    const res = await call('GET', `/api/menu/items/${fx.itemId}/reviews`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.reviews), 'response has a reviews array');
    assert.equal(res.body.reviews.length, 3);

    // Newest first: rating 5, then 4, then 2.
    assert.deepEqual(res.body.reviews.map((r) => r.rating), [5, 4, 2]);
    for (const r of res.body.reviews) {
      assert.equal(typeof r.rating, 'number', 'rating is a number, not a string');
      assert.equal(typeof r.author_name, 'string');
    }
  } finally {
    await cleanup(fx);
  }
});

// ─── 2. Empty list for an item with no reviews ────────────────────────────────

test('an item with no reviews returns an empty list', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createItem();
  try {
    const res = await call('GET', `/api/menu/items/${fx.itemId}/reviews`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.reviews, []);
  } finally {
    await cleanup(fx);
  }
});

// ─── 3. Invalid id ────────────────────────────────────────────────────────────

test('a non-numeric id is rejected with 400', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const res = await call('GET', '/api/menu/items/abc/reviews');
  assert.equal(res.status, 400);
});

// ─── 4. Staff menu aggregates ─────────────────────────────────────────────────

test('the staff menu exposes avg_rating and review_count', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createItem({ withReviews: 3 }); // ratings 2,4,5 -> avg 3.67
  try {
    const res = await call('GET', '/api/menu/staff');
    assert.equal(res.status, 200);
    const item = res.body.items.find((i) => i.id === fx.itemId);
    assert.ok(item, 'the seeded item is present in the staff menu');
    assert.equal(item.review_count, 3);
    assert.ok(Math.abs(item.avg_rating - (11 / 3)) < 0.01, `avg_rating ~3.67, got ${item.avg_rating}`);
  } finally {
    await cleanup(fx);
  }
});

// ─── 5. Customer submits a review ─────────────────────────────────────────────

test('a customer can submit a review and re-posting updates it', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createItem();
  fx.customerId = await createCustomer();
  const tok = signInCustomer(fx.customerId);
  try {
    const first = await call('POST', `/api/menu/items/${fx.itemId}/reviews`, {
      rawToken: tok, body: { rating: 4, comment: 'Masarap!' },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.review.rating, 4);
    assert.equal(first.body.review.comment, 'Masarap!');
    assert.equal(first.body.review.author_name, 'Test Reviewer');

    // Same customer re-posts -> updates, no duplicate.
    const second = await call('POST', `/api/menu/items/${fx.itemId}/reviews`, {
      rawToken: tok, body: { rating: 5, comment: 'Even better the second time.' },
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.review.rating, 5);

    const list = await call('GET', `/api/menu/items/${fx.itemId}/reviews`);
    assert.equal(list.body.reviews.length, 1, 'still exactly one review for this customer');
    assert.equal(list.body.reviews[0].rating, 5);
  } finally {
    await cleanup(fx);
  }
});

// ─── 6. Validation + auth gates ───────────────────────────────────────────────

test('review submission validates rating and requires a customer token', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');

  const fx = await createItem();
  fx.customerId = await createCustomer();
  const tok = signInCustomer(fx.customerId);
  try {
    const bad = await call('POST', `/api/menu/items/${fx.itemId}/reviews`, {
      rawToken: tok, body: { rating: 9 },
    });
    assert.equal(bad.status, 400, 'out-of-range rating is rejected');

    // Staff token cannot post.
    const staff = await call('POST', `/api/menu/items/${fx.itemId}/reviews`, {
      body: { rating: 3 },
    });
    assert.equal(staff.status, 403, 'staff is blocked by requireCustomer');

    // Missing item.
    const ghost = await call('POST', `/api/menu/items/99999999/reviews`, {
      rawToken: tok, body: { rating: 3 },
    });
    assert.equal(ghost.status, 404);

    // Unknown item id format.
    const bad2 = await call('POST', '/api/menu/items/abc/reviews', {
      rawToken: tok, body: { rating: 3 },
    });
    assert.equal(bad2.status, 400);
  } finally {
    await cleanup(fx);
  }
});
