const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If DATABASE_URL is not set, fall back to individual env vars:
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'bingnondo_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  // Connection pool settings
  max:             10,   // max simultaneous connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // SSL: enable for production (Railway/Render require it)
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
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