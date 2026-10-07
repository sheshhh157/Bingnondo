// Test-database bootstrap. Creates the DB named by DB_NAME_TEST (default
// bingnondo_test) when missing, restores the canonical schema from
// backend/scripts/base-schema.sql, marks every numbered migration as applied
// (that file is a schema-only dump of the migrated dev database, so it already
// reflects the post-migration state), then seeds the rows tests rely on (staff
// accounts of every role, the ESP32 test device, orderable menu items).
//
// Safety: never runs against DB_NAME. If DB_NAME_TEST is unset it defaults
// to bingnondo_test; if DB_NAME_TEST === DB_NAME it refuses to start.
//
// The accounts seeded here exist so route-level tests can sign real JWTs for
// every role without hand-seeding database. Passwords are placeholders: tests
// authenticate by forging JWTs, never by exercising POST /api/auth/staff/login.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

const devDbName = process.env.DB_NAME || 'bingnondo';
const testDbName = process.env.DB_NAME_TEST || 'bingnondo_test';

if (testDbName === devDbName) {
  console.error(`[test:setup] DB_NAME_TEST ("${testDbName}") equals DB_NAME ("${devDbName}"). Refusing to run against the dev database.`);
  process.exit(1);
}

const base = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

async function main() {
  const admin = new Client({ ...base, database: 'postgres' });
  await admin.connect();
  const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDbName]);
  if (found.rows.length === 0) {
    await admin.query(`CREATE DATABASE "${testDbName.replace(/"/g, '""')}"`);
    console.log(`[test:setup] created database ${testDbName}`);
  } else {
    console.log(`[test:setup] database ${testDbName} exists`);
  }
  await admin.end();

  const testDb = new Client({ ...base, database: testDbName });
  await testDb.connect();

  const hasBase = await testDb.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'orders' LIMIT 1");
  if (hasBase.rows.length === 0) {
    const schema = fs.readFileSync(path.join(__dirname, 'base-schema.sql'), 'utf8');
    await testDb.query(schema);
    console.log('[test:setup] restored canonical schema from scripts/base-schema.sql');
  }
  await testDb.end();

  const env = { ...process.env, NODE_ENV: 'test' };
  const run = (args) => {
    const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
    if (r.status !== 0) { console.error(`[test:setup] "${args.join(' ')}" failed`); process.exit(r.status ?? 1); }
  };
  // base-schema.sql is a dump of an already-migrated database, so the chain is
  // recorded rather than replayed. Replaying it would not be safe anyway: 008 and
  // 011 ADD CONSTRAINT with no preceding DROP, and Postgres has no
  // ADD CONSTRAINT IF NOT EXISTS, so a second run errors on the duplicate name.
  run([path.join(__dirname, 'migrate.js'), '--mark-all-applied']);

  // Re-seed anchor rows tests assume exist (categories come from the restored
  // schema, staff accounts + ESP32 device are manual anchors).
  const client = new Client({ ...base, database: testDbName });
  await client.connect();

  await client.query(`
    INSERT INTO menu_categories (name) VALUES
      ('Rice Meals'), ('Appetizers'), ('Drinks (Caffeinated)'),
      ('Drinks (Non-Caffeinated)'), ('Drinks (Student)'), ('Student Meal'), ('Student Platter')
    ON CONFLICT (name) DO NOTHING`);

  await client.query(`
    INSERT INTO staff_accounts (full_name, email, password_hash, role, status) VALUES
      ('Seed Owner',   'owner@bingnondo.test',   'seed-no-login', 'owner',        'active'),
      ('Seed Admin',   'admin@bingnondo.test',   'seed-no-login', 'admin',        'active'),
      ('Seed Manager', 'manager@bingnondo.test', 'seed-no-login', 'manager',      'active'),
      ('Seed Staff',   'staff@bingnondo.test',   'seed-no-login', 'staff',        'active'),
      ('Seed Cashier', 'cashier@bingnondo.test', 'seed-no-login', 'cashier',      'active'),
      ('Seed Kitchen', 'kitchen@bingnondo.test', 'seed-no-login', 'kitchen_staff','active')
    ON CONFLICT (email) DO NOTHING`);

  await client.query(`
    INSERT INTO esp32_devices (device_code, location_label, status)
    VALUES ('ESP32-KitchenA', 'Kitchen Counter A', 'online')
    ON CONFLICT (device_code) DO NOTHING`);

  // At least two items exist: some tests ask for LIMIT 2. Name-keyed check so
  // re-running setup never duplicates row contents.
  for (const [name, price] of [['Seed Tapsilog', 100], ['Seed Shoyu', 85]]) {
    const existing = await client.query('SELECT 1 FROM menu_items WHERE name = $1 LIMIT 1', [name]);
    if (existing.rows.length === 0) {
      const cat = await client.query("SELECT id FROM menu_categories WHERE name = 'Rice Meals' LIMIT 1");
      if (cat.rows[0]) {
        await client.query(
          'INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES ($1, $2, $3, $4, true)',
          [cat.rows[0].id, name, 'test fixture item', price]
        );
      }
    }
  }
  await client.end();
  console.log('[test:setup] seed rows present; test DB is ready');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
