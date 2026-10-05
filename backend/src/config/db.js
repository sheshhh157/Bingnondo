const { Pool } = require('pg');

// Test runs must never touch the dev database. Resolve the target name here,
// and refuse to start a pool pointed back at DB_NAME.
let database = process.env.DB_NAME || 'bingnondo_db';
if (process.env.NODE_ENV === 'test') {
  database = process.env.DB_NAME_TEST || 'bingnondo_test';
  if (database === process.env.DB_NAME) {
    throw new Error(
      `[config] Refusing to run tests against the dev database "${process.env.DB_NAME}". ` +
      'Set DB_NAME_TEST to a different database (default: bingnondo_test).'
    );
  }
}

const pool = new Pool({
  // DATABASE_URL is honored for normal runs; in test runs the explicit
  // DB_NAME_TEST wins so a stale DATABASE_URL cannot point tests at dev data.
  ...(process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL
    ? {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432', 10),
        database,
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
    : { connectionString: process.env.DATABASE_URL }),
  // Connection pool settings
  max:             10,   // max simultaneous connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // SSL: enable for production (Railway/Render require it)
  // Set session timezone per connection via pool options
  options: '-c timezone=Asia/Manila',
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// Test connection on startup
pool.connect()
  .then((client) => {
    console.log('[db] PostgreSQL connected successfully.');
    console.log('[db] Database:', database);
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