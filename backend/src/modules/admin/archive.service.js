const db = require('../../config/db');
const { cloudinary } = require('../../config/cloudinary');
const ID_SEQUENCES = {
  menu_categories: 'menu_categories_id_seq',
  variant_groups: 'variant_groups_id_seq',
  menu_item_variants: 'menu_item_variants_id_seq',
  staff_accounts: 'staff_accounts_id_seq',
  riders: 'riders_id_seq',
  payment_qr_codes: 'payment_qr_codes_id_seq',
};

async function archiveRecord(client, { entityType, entityId, displayName, payload, actorId }) {
  const { rows } = await client.query(
    `INSERT INTO archived_records
       (entity_type, entity_id, display_name, payload, archived_by)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id, entity_type, entity_id, display_name, archived_at, expires_at`,
    [entityType, entityId, displayName, JSON.stringify(payload), actorId || null]
  );
  return rows[0];
}

async function restoreTableRow(client, table, row) {
  const { rows: columnRows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND is_generated = 'NEVER'
      ORDER BY ordinal_position`,
    [table]
  );
  const columns = columnRows.map(({ column_name }) => `"${column_name}"`).join(', ');
  if (!columns) throw new Error(`No restorable columns found for ${table}.`);

  await client.query(
    `INSERT INTO ${table} (${columns})
     SELECT ${columns}
       FROM jsonb_populate_record(NULL::${table}, $1::jsonb)`,
    [JSON.stringify(row)]
  );
}

async function syncSequence(client, table) {
  const sequence = ID_SEQUENCES[table];
  if (!sequence) throw new Error(`No ID sequence is configured for ${table}.`);
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence($1, 'id'),
       GREATEST(
         COALESCE((SELECT MAX(id) FROM ${table}), 1),
         (SELECT last_value FROM ${sequence})
       ),
       true
     )`,
    [table]
  );
}

async function restoreArchivedRecord(client, archived) {
  const payload = archived.payload;

  switch (archived.entity_type) {
    case 'menu_item': {
      const { rows } = await client.query(
        `UPDATE menu_items
            SET is_deleted = FALSE,
                deleted_at = NULL,
                is_available = $2,
                updated_at = NOW()
          WHERE id = $1 AND is_deleted = TRUE
          RETURNING id`,
        [archived.entity_id, payload.is_available]
      );
      if (!rows.length) throw new Error('The archived menu item no longer exists.');
      return;
    }
    case 'menu_category':
      await restoreTableRow(client, 'menu_categories', payload.record);
      for (const [categoryId, groupId] of payload.variant_links || []) {
        await client.query(
          `INSERT INTO menu_category_variant_groups (category_id, variant_group_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [categoryId, groupId]
        );
      }
      for (const [itemId, categoryId] of payload.inventory_links || []) {
        await client.query(
          `INSERT INTO inventory_item_categories (inventory_item_id, category_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [itemId, categoryId]
        );
      }
      await syncSequence(client, 'menu_categories');
      return;
    case 'variant_group':
      await restoreTableRow(client, 'variant_groups', payload.record);
      for (const [categoryId, groupId] of payload.category_links || []) {
        await client.query(
          `INSERT INTO menu_category_variant_groups (category_id, variant_group_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [categoryId, groupId]
        );
      }
      for (const variant of payload.menu_item_variants || []) {
        await restoreTableRow(client, 'menu_item_variants', variant);
      }
      await syncSequence(client, 'variant_groups');
      if ((payload.menu_item_variants || []).length) {
        await syncSequence(client, 'menu_item_variants');
      }
      return;
    case 'staff_account':
      await restoreTableRow(client, 'staff_accounts', payload.record);
      await syncSequence(client, 'staff_accounts');
      return;
    case 'rider':
      await restoreTableRow(client, 'riders', payload.record);
      await syncSequence(client, 'riders');
      return;
    case 'payment_qr_code':
      await restoreTableRow(client, 'payment_qr_codes', payload.record);
      await syncSequence(client, 'payment_qr_codes');
      return;
    default:
      throw new Error(`Unsupported archived record type: ${archived.entity_type}`);
  }
}

async function permanentlyDeleteArchivedRecord(client, archived, { expired = false } = {}) {
  if (archived.entity_type === 'menu_item') {
    try {
      await client.query('DELETE FROM menu_items WHERE id = $1', [archived.entity_id]);
    } catch (err) {
      if (!(expired && err.code === '23503')) throw err;
      // Keep the hidden catalog row because order history still references it.
      console.warn(`[archive] Retaining menu item ${archived.entity_id} for order history.`);
    }
  }

  await client.query('DELETE FROM archived_records WHERE id = $1', [archived.id]);
}

async function cleanupArchivedImage(archived) {
  const publicId = archived.payload?.record?.image_public_id || archived.payload?.image_public_id;
  const allowedFolder = archived.entity_type === 'menu_item'
    ? 'bingnondo/menu/'
    : archived.entity_type === 'payment_qr_code'
      ? 'bingnondo/qr_codes/'
      : null;
  if (!publicId || !allowedFolder || !publicId.startsWith(allowedFolder)) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error(`[archive] Failed to remove archived image for ${archived.entity_type} ${archived.entity_id}:`, err.message);
  }
}

async function purgeExpiredArchiveRecords() {
  const { rows } = await db.query(
    `SELECT id
       FROM archived_records
      WHERE expires_at <= NOW()
      ORDER BY expires_at ASC
      LIMIT 100`
  );

  for (const { id } of rows) {
    const client = await db.getClient();
    let archived;
    try {
      await client.query('BEGIN');
      const { rows: locked } = await client.query(
        `SELECT * FROM archived_records
          WHERE id = $1 AND expires_at <= NOW()
          FOR UPDATE SKIP LOCKED`,
        [id]
      );
      if (!locked.length) {
        await client.query('ROLLBACK');
        continue;
      }
      archived = locked[0];
      await permanentlyDeleteArchivedRecord(client, archived, { expired: true });
      await client.query('COMMIT');
      if (archived.entity_type === 'menu_item' || archived.entity_type === 'payment_qr_code') {
        await cleanupArchivedImage(archived);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[archive] Failed to purge archived record ${id}:`, err.message);
    } finally {
      client.release();
    }
  }
}

module.exports = {
  archiveRecord,
  cleanupArchivedImage,
  permanentlyDeleteArchivedRecord,
  purgeExpiredArchiveRecords,
  restoreArchivedRecord,
};
