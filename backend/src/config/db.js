const { Pool } = require('pg');
const getDatabaseOptions = require('./databaseOptions');

const pool = new Pool({
  ...getDatabaseOptions(),
  // Connection pool settings
  max:             10,   // max simultaneous connections
  idleTimeoutMillis: 30000,
  allowExitOnIdle: true,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.connect()
  .then((client) => {
    console.log('[db] PostgreSQL connected successfully.');
    client.release();
  })
  .catch((err) => {
    console.error('[db] PostgreSQL connection error:', err.message);
    // Don't crash — server can still start; DB errors will surface per-request.
  });

module.exports = {
  /**
   * Run a parameterized query.
   * @param {string} text   - SQL string with $1, $2... placeholders
   * @param {any[]}  params - parameter values
   */
  query: (text, params) => pool.query(text, params),

  /**
   * Get a client from the pool (for transactions).
   * Remember to call client.release() after use.
   */
  getClient: () => pool.connect(),

  pool,
};