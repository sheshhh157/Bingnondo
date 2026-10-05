require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');

let db = null;
try { db = require('../src/config/db'); } catch {}

const canQuery = async () => {
  if (!db) return false;
  try { await db.query('SELECT 1'); return true; } catch { return false; }
};

const scheduler = require('../src/scheduler');

test('auto-cancel skips when a paid payment is inserted after candidate SELECT', async (t) => {
  console.log('test started');
  if (!(await canQuery())) return t.skip('no database');

  // Insert test order
  const { rows: [inserted] } = await db.query(`
    INSERT INTO orders (order_type, status, order_channel, total_amount, cashier_id, created_at)
    VALUES ('counter', 'pending', 'web_counter', 50, NULL, NOW() - INTERVAL '40 minutes')
    RETURNING id
  `);

  // Override db.getClient to intercept the paid payment detection query.
  const originalGetClient = db.getClient;
  db.getClient = async () => {
    const client = await originalGetClient();
    const originalQuery = client.query;
    client.query = async (sql, params) => {
      if (typeof sql === 'string' && sql.includes("SELECT 1 FROM payments WHERE order_id = $1 AND status = 'paid' LIMIT 1")) {
        // Simulate that a payment row was inserted after the candidate SELECT.
        return Promise.resolve({ rows: [{ exists: true }] });
      }
      return originalQuery.apply(client, [sql, params]);
    };
    return client;
  };

  try {
    await scheduler.autoCancelCounterOrders();
    const { rows: [updated] } = await db.query(`SELECT status FROM orders WHERE id = $1`, [inserted.id]);
    assert.equal(updated.status, 'pending', 'order must remain uncancelled');
  } finally {
    db.getClient = originalGetClient;
  }
});
