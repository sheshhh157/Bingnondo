/**
 * seed-reviews.js — insert the 7 sample menu-item reviews the customer app
 * ships as mock data, so the "Ratings & Reviews" section shows content on a
 * fresh database.
 *
 * Demo data only (kept out of the schema migration). Idempotent: re-running
 * skips any (menu_item_id, author_name) pair already present. Reviews are
 * attached with customer_id = NULL because the customers table is empty on a
 * fresh install; author_name is the display snapshot.
 *
 * Run: npm --prefix backend run seed:reviews
 */

const path = require('path');
const { Client } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const REVIEWS = [
  { author_name: 'Mariel S.',  rating: 5, comment: 'Sobrang sarap! Authentic ang lasa, parang nasa Binondo talaga. Bababalik-balikan ko ito.', created_at: '2026-09-28T09:12:00.000Z' },
  { author_name: 'Jonas R.',   rating: 4, comment: 'Great value for the portion. Medyo matagal lang ang waiting time noong peak hour.', created_at: '2026-09-24T14:05:00.000Z' },
  { author_name: 'Alyssa T.',  rating: 5, comment: 'Perfectly seasoned and served hot. Recommended!', created_at: '2026-09-19T18:40:00.000Z' },
  { author_name: 'Marco D.',   rating: 3, comment: 'Okay naman, pero sana mas malaki ang serving para sa price.', created_at: '2026-09-15T11:22:00.000Z' },
  { author_name: 'Katrina L.', rating: 5, comment: 'Favourite ko na! Consistent ang quality every order.', created_at: '2026-09-10T20:15:00.000Z' },
  { author_name: 'Paolo M.',   rating: 4, comment: 'Solid comfort food. Presentation is neat and appetising.', created_at: '2026-09-04T12:30:00.000Z' },
  { author_name: 'Bea C.',     rating: 4, comment: 'Masarap at bagong luto. Ang packaging ay maayos din.', created_at: '2026-08-30T16:48:00.000Z' },
];

(async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  await client.connect();

  // Attach to the lowest-id live menu item so the app has something to show.
  const target = await client.query(
    `SELECT id, name FROM menu_items WHERE is_deleted = FALSE ORDER BY id LIMIT 1`
  );
  if (target.rowCount === 0) {
    console.log('No menu items found — nothing to seed.');
    await client.end();
    return;
  }
  const itemId = target.rows[0].id;
  console.log(`Seeding reviews for menu item #${itemId} (${target.rows[0].name}).`);

  let inserted = 0;
  for (const r of REVIEWS) {
    const exists = await client.query(
      `SELECT 1 FROM menu_item_reviews WHERE menu_item_id = $1 AND author_name = $2 LIMIT 1`,
      [itemId, r.author_name]
    );
    if (exists.rowCount > 0) continue;

    await client.query(
      `INSERT INTO menu_item_reviews (menu_item_id, customer_id, author_name, rating, comment, created_at)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [itemId, r.author_name, r.rating, r.comment, r.created_at]
    );
    inserted++;
  }

  await client.end();
  console.log(`Done. Inserted ${inserted} review(s), skipped ${REVIEWS.length - inserted} existing.`);
})().catch((err) => {
  console.error(`Seed failed: ${err.message}`);
  process.exit(1);
});
