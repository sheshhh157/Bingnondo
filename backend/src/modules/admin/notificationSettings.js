const db = require('../../config/db');

// The event categories the notification bell can show. Order is the display
// order used by the System Settings page.
const NOTIFICATION_CATEGORIES = [
  'orders',
  'payments',
  'deliveries',
  'inventory',
  'kitchen',
  'customers',
  'system',
];

const defaultCategories = () =>
  Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, true]));

/**
 * Coerce whatever is stored in system_settings into the canonical shape:
 * every known category present, booleans only. Unknown keys are dropped and
 * missing ones default to visible.
 */
function normalizeNotificationSettings(raw) {
  const categories = defaultCategories();
  const stored = raw && typeof raw === 'object' ? raw.categories : null;
  if (stored && typeof stored === 'object') {
    for (const c of NOTIFICATION_CATEGORIES) {
      if (typeof stored[c] === 'boolean') categories[c] = stored[c];
    }
  }
  return { categories };
}

/** Read the `notifications` row; falls back to all-visible when unset. */
async function readNotificationSettings() {
  const { rows } = await db.query(
    `SELECT value FROM system_settings WHERE key = 'notifications'`
  );
  return normalizeNotificationSettings(rows[0]?.value);
}

module.exports = {
  NOTIFICATION_CATEGORIES,
  normalizeNotificationSettings,
  readNotificationSettings,
};
