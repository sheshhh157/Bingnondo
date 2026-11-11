/**
 * migrate.js — apply every SQL file in backend/migrations in filename order.
 *
 * Uses the same connection settings as the app (backend/.env), so it works on
 * Windows without a DATABASE_URL. All migrations are idempotent, so running
 * this repeatedly is safe.
 *
 * Run: npm --prefix backend run migrate
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const getDatabaseOptions = require('../src/config/databaseOptions');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
  const client = new Client(getDatabaseOptions());

  await client.connect();

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log('No migrations found.');
  }

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await client.query(sql);
    console.log(`✓ ${file}`);
  }

  await client.end();
  console.log(`Done. Applied ${files.length} migration(s).`);
})().catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
