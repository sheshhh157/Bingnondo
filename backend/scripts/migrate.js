#!/usr/bin/env node
// Migration runner — applies backend/migrations/*.sql in lexical order and
// records each in _migrations, so a database always knows exactly which files
// have run against it. Every migration is expected to be idempotent (they all
// have been written that way), which makes a failed-then-retried run safe.
//
// Usage: npm run migrate

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Target database: test runs go to DB_NAME_TEST so the suite can never touch
// the dev schema. An explicit DB_NAME_TEST equal to DB_NAME is a hard stop.
const isTestRun = process.env.NODE_ENV === 'test';
const targetDb = isTestRun
  ? (process.env.DB_NAME_TEST || 'bingnondo_test')
  : (process.env.DB_NAME || 'bingnondo_db');
if (isTestRun && targetDb === (process.env.DB_NAME || 'bingnondo_db')) {
  console.error(`[migrate] NODE_ENV=test but DB_NAME_TEST resolves to the dev database "${targetDb}". Refusing to run.`);
  process.exit(1);
}

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: targetDb,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query('SELECT filename FROM _migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // --mark-all-applied: record every migration as applied without running
  // them. Use right after restoring the canonical schema (bingnondo_database.sql),
  // which already reflects the full post-migration state.
  if (process.argv.includes('--mark-all-applied')) {
    for (const f of files) {
      await client.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
    }
    console.log(`marked ${files.length} migrations as applied`);
    await client.end();
    return;
  }

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      // A multi-statement query() call runs as one implicit transaction, so a
      // failing file rolls itself back rather than leaving a half-applied schema.
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      console.log(`apply ${file}`);
    } catch (err) {
      console.error(`FAIL  ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
