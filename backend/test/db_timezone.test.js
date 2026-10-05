const test = require('node:test');
const assert = require('node:assert/strict');

test('db pool timezone is Asia/Manila', async () => {
  require('dotenv').config();
  const db = require('../src/config/db');
  try {
    const res = await db.query('SHOW timezone');
    assert.equal(res.rows[0].TimeZone, 'Asia/Manila');
  } finally {
    // nothing
  }
});
