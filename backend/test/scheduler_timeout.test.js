require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const { getTimeoutMinutes } = require('../src/scheduler');

test('timeout is clamped to 5 minutes', () => {
  const originalWarn = console.warn;
  const logs = [];
  console.warn = (msg) => logs.push(msg);
  const saved = process.env.UNPAID_ORDER_TIMEOUT_MIN;
  try {
    for (const value of ['0', '-3', '2']) {
      logs.length = 0;
      process.env.UNPAID_ORDER_TIMEOUT_MIN = value;
      const val = getTimeoutMinutes();
      assert.equal(val, 5);
      assert(logs.some((m) => m.includes('clamped to 5')));
    }
  } finally {
    console.warn = originalWarn;
    if (saved === undefined) delete process.env.UNPAID_ORDER_TIMEOUT_MIN;
    else process.env.UNPAID_ORDER_TIMEOUT_MIN = saved;
  }
});

test('autoCancelCounterOrders recovers from a db error', async () => {
  const db = require('../src/config/db');
  const origQuery = db.query;
  db.query = () => { throw new Error('forced db error'); };
  try {
    await require('../src/scheduler').autoCancelCounterOrders();
    // should not throw
    assert.ok(true);
  } finally {
    db.query = origQuery;
  }
});
