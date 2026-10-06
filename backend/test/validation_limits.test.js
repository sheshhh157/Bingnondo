/**
 * Input validation and numeric limits on write routes.
 *
 * Why these exist: the handlers only declared required-ness before, so a
 * `price` of "Infinity" or a `quantity` of "abc" passed the checks and blew
 * up as a 500 from Postgres, and there was no length cap matching the
 * VARCHAR(n) columns, so long input failed with a raw error rather than a
 * 400. Each test here asserts the handler rejects the bad payload with a
 * 4xx message, plus a small unit suite for the shared helpers.
 *
 * Database-backed assertions skip when no database is reachable.
 *
 * Run with: npm test
 */

const test = require('node:test');
const { before } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const { lengthCap, numInRange, MAX_NUMERIC } = require('../src/lib/validators');

// ─── pure helpers ─────────────────────────────────────────────────────────────

test('lengthCap rejects over-long strings, accepts cap + shorter', () => {
  assert.equal(lengthCap('a'.repeat(149), 'Name', 150), null);
  assert.equal(lengthCap('a'.repeat(150), 'Name', 150), null);
  assert.match(lengthCap('a'.repeat(151), 'Name', 150), /150/);
  assert.equal(lengthCap(123, 'Name', 150), null, 'non-string is the caller\'s type guard');
});

test('numInRange rejects NaN, Infinity, empty string, and out-of-range', () => {
  assert.match(numInRange('abc', 'Price'), /valid number/);
  assert.match(numInRange(Infinity, 'Price'), /valid number/);
  assert.match(numInRange('', 'Price'), /required/);
  assert.match(numInRange(Infinity - Infinity, 'Price'), /valid number/);
  assert.match(numInRange(100000000, 'Stock'), /exceed/);
  assert.match(numInRange(-5, 'Price'), /at least 0/);
  assert.equal(numInRange('12.5', 'Price'), null);
  assert.equal(numInRange(MAX_NUMERIC, 'Stock'), null);
  assert.match(numInRange(0, 'Quantity', { min: 0, exclusive: true }), /greater than 0/);
});

// ─── request-level helpers ────────────────────────────────────────────────────

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

let token = null;
const signIn = async () => {
  if (token) return token;
  const owner = await db.query(
    `SELECT id FROM staff_accounts WHERE role IN ('owner','admin') AND status = 'active' ORDER BY id LIMIT 1`);
  if (owner.rowCount === 0) return null;
  const jwt = require('jsonwebtoken');
  token = jwt.sign(
    { sub: owner.rows[0].id, type: 'staff', role: 'owner' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' },
  );
  return token;
};

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/menu', require('../src/modules/menu/menu.routes'));
  app.use('/api/inventory', require('../src/modules/inventory/inventory.routes'));
  return app;
}

async function post(path, body) {
  const jwtToken = await signIn();
  if (!jwtToken) return { status: 0, body: null };
  const server = buildApp().listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwtToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

// ─── handler-level ────────────────────────────────────────────────────────────

test('inventory create rejects an over-long name', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const res = await post('/api/inventory', { name: 'x'.repeat(151), unit: 'kg' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /50/);
});

test('inventory create rejects non-numeric and infinite stock', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const bad1 = await post('/api/inventory', { name: 'Validation probe', unit: 'kg', current_stock: 'abc' });
  assert.equal(bad1.status, 400);
  const bad2 = await post('/api/inventory', { name: 'Validation probe', unit: 'kg', current_stock: 'Infinity' });
  assert.equal(bad2.status, 400);
});

test('inventory transaction rejects a non-numeric quantity instead of a 500', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const res = await post('/api/inventory/1/transaction', { change_type: 'restock', quantity: 'abc' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /valid number/);
});

test('menu create rejects a non-finite price and a non-array ingredients list', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const badPrice = await post('/api/menu', { name: 'Validation probe', category_id: 1, price: 'Infinity' });
  assert.equal(badPrice.status, 400);
  const badIngredients = await post('/api/menu', { name: 'Validation probe', category_id: 1, price: 10, ingredients: 'abc' });
  assert.equal(badIngredients.status, 400);
  assert.match(badIngredients.body.message, /ingredients/);
});

test('menu create rejects over-long description and over-wide image_url', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const badDesc = await post('/api/menu', { name: 'Probe', category_id: 1, price: 10, description: 'd'.repeat(501) });
  assert.equal(badDesc.status, 400);
  const badImg = await post('/api/menu', { name: 'Probe', category_id: 1, price: 10, image_url: 'u'.repeat(501) });
  assert.equal(badImg.status, 400);
});

test('category create rejects a 101-character name', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const res = await post('/api/menu/categories', { name: 'c'.repeat(101) });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /100/);
});

test('option create rejects infinite price and over-long names', async (t) => {
  if (!(await canQuery())) return t.skip('no database reachable');
  const badPrice = await post('/api/menu/1/options', { name: 'Hot', price: 'Infinity' });
  assert.equal(badPrice.status, 400);
  const badName = await post('/api/menu/1/options', { name: 'n'.repeat(151), price: 1 });
  assert.equal(badName.status, 400);
});
