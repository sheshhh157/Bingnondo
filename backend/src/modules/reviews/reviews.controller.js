const db = require('../../config/db');

// ─── Internal helpers ─────────────────────────────────────────────────────────
function _parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function _mapReview(r) {
  return {
    id: r.id,
    menu_item_id: r.menu_item_id,
    customer_id: r.customer_id,
    author_name: r.author_name,
    rating: Number(r.rating),
    comment: r.comment ?? '',
    created_at: r.created_at,
  };
}

// ─── GET /api/menu/items/:id/reviews ──────────────────────────────────────────
// Public — the customer app reads this for the "Ratings & Reviews" section of
// the menu-item detail sheet. Newest first. Unknown items simply return an
// empty list (the app degrades gracefully).
async function getItemReviews(req, res, next) {
  try {
    const itemId = _parseId(req.params.id);
    if (!itemId) return res.status(400).json({ message: 'Invalid menu item id.' });

    const { rows } = await db.query(
      `SELECT id, menu_item_id, customer_id, author_name, rating, comment, created_at
         FROM menu_item_reviews
        WHERE menu_item_id = $1
        ORDER BY created_at DESC, id DESC`,
      [itemId]
    );

    res.json({ reviews: rows.map(_mapReview) });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/menu/items/:id/reviews ─────────────────────────────────────────
// Customer — submit a 1-5 star rating with an optional comment. Guarded by
// requireCustomer, so req.user.sub is customers.id. author_name is snapshotted
// from the customer record. A customer may review a given item once; re-posting
// updates their existing review.
async function createItemReview(req, res, next) {
  try {
    const itemId = _parseId(req.params.id);
    if (!itemId) return res.status(400).json({ message: 'Invalid menu item id.' });

    const customerId = req.user?.sub;
    if (!customerId) return res.status(401).json({ message: 'Not authenticated.' });

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5.' });
    }
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (comment.length > 1000) {
      return res.status(400).json({ message: 'Comment must be 1000 characters or fewer.' });
    }

    // The item must exist and be live.
    const item = await db.query(
      `SELECT id FROM menu_items WHERE id = $1 AND is_deleted = FALSE`,
      [itemId]
    );
    if (item.rowCount === 0) {
      return res.status(404).json({ message: 'Menu item not found.' });
    }

    // Snapshot the author's display name.
    const cust = await db.query(
      `SELECT first_name, last_name FROM customers WHERE id = $1`,
      [customerId]
    );
    if (cust.rowCount === 0) {
      return res.status(403).json({ message: 'Customer account not found.' });
    }
    const { first_name, last_name } = cust.rows[0];
    const authorName = [first_name, last_name].filter(Boolean).join(' ').trim() || 'Anonymous';

    const { rows } = await db.query(
      `INSERT INTO menu_item_reviews (menu_item_id, customer_id, author_name, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (menu_item_id, customer_id) WHERE customer_id IS NOT NULL
       DO UPDATE SET rating = EXCLUDED.rating,
                     comment = EXCLUDED.comment,
                     author_name = EXCLUDED.author_name,
                     created_at = CURRENT_TIMESTAMP
       RETURNING id, menu_item_id, customer_id, author_name, rating, comment, created_at`,
      [itemId, customerId, authorName, rating, comment || null]
    );

    res.status(201).json({ review: _mapReview(rows[0]) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getItemReviews, createItemReview };
