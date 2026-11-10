const db = require('../../config/db');
const {
  cleanupArchivedImage,
  permanentlyDeleteArchivedRecord,
  restoreArchivedRecord,
} = require('./archive.service');

const ARCHIVE_TYPES = [
  'menu_item',
  'menu_category',
  'variant_group',
  'staff_account',
  'rider',
  'payment_qr_code',
];

exports.listArchivedRecords = async (req, res) => {
  try {
    const requestedPage = Number.parseInt(req.query.page, 10);
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 10;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type : 'all';

    if (type !== 'all' && !ARCHIVE_TYPES.includes(type)) {
      return res.status(400).json({ message: 'Invalid archive record type.' });
    }

    const conditions = ['a.expires_at > NOW()'];
    const params = [];
    if (type !== 'all') {
      params.push(type);
      conditions.push(`a.entity_type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const searchParam = `$${params.length}`;
      conditions.push(
        `(a.display_name ILIKE ${searchParam}
          OR a.entity_type ILIKE ${searchParam}
          OR a.entity_id::text ILIKE ${searchParam}
          OR COALESCE(s.full_name, '') ILIKE ${searchParam})`
      );
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total
         FROM archived_records a
         LEFT JOIN staff_accounts s ON s.id = a.archived_by
        ${where}`,
      params
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.min(page, Math.max(1, totalPages));
    const offset = (currentPage - 1) * limit;
    const listParams = [...params, limit, offset];

    const { rows } = await db.query(
      `SELECT a.id, a.entity_type, a.entity_id, a.display_name,
              a.archived_at, a.expires_at, s.full_name AS archived_by_name
         FROM archived_records a
         LEFT JOIN staff_accounts s ON s.id = a.archived_by
        ${where}
        ORDER BY a.archived_at DESC, a.id DESC`
        + ` LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );
    return res.json({
      data: rows,
      pagination: { page: currentPage, limit, total, total_pages: totalPages },
    });
  } catch (err) {
    console.error('[archive.listArchivedRecords]', err);
    return res.status(500).json({ message: 'Failed to load the archive.' });
  }
};

exports.restoreArchivedRecord = async (req, res) => {
  const client = await db.getClient();
  try {
    const archiveId = Number(req.params.id);
    if (!Number.isInteger(archiveId) || archiveId < 1) {
      return res.status(400).json({ message: 'Invalid archive record ID.' });
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM archived_records
        WHERE id = $1 AND expires_at > NOW()
        FOR UPDATE`,
      [archiveId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Archive record not found or has expired.' });
    }

    await restoreArchivedRecord(client, rows[0]);
    await client.query('DELETE FROM archived_records WHERE id = $1', [archiveId]);
    await client.query('COMMIT');
    return res.json({ message: `${rows[0].display_name} was restored.` });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A record with the same unique details already exists. Resolve the conflict before restoring.' });
    }
    console.error('[archive.restoreArchivedRecord]', err);
    return res.status(500).json({ message: 'Failed to restore the archived record.' });
  } finally {
    client.release();
  }
};

exports.deleteArchivedRecord = async (req, res) => {
  const client = await db.getClient();
  let archived;
  try {
    const archiveId = Number(req.params.id);
    if (!Number.isInteger(archiveId) || archiveId < 1) {
      return res.status(400).json({ message: 'Invalid archive record ID.' });
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM archived_records WHERE id = $1 FOR UPDATE',
      [archiveId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Archive record not found.' });
    }
    archived = rows[0];
    await permanentlyDeleteArchivedRecord(client, archived);
    await client.query('COMMIT');
    await cleanupArchivedImage(archived);
    return res.json({ message: `${archived.display_name} was permanently deleted.` });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(409).json({ message: 'This record is still used by saved order or audit history and cannot be permanently deleted.' });
    }
    console.error('[archive.deleteArchivedRecord]', err);
    return res.status(500).json({ message: 'Failed to permanently delete the archived record.' });
  } finally {
    client.release();
  }
};
