const db = require('../../config/db');
const { cloudinary } = require('../../config/cloudinary');
const { archiveRecord } = require('./archive.service');

// Only images that live in our QR folder may be deleted from Cloudinary.
const QR_FOLDER = 'bingnondo/qr_codes/';

const SELECT_COLUMNS = `
  id, name, number, image_url, image_public_id,
  is_active, display_order, created_by, created_at, updated_at
`;

async function writeAuditLog(client, actorId, action, targetId, details = {}) {
  await client.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details)
     VALUES ($1, $2, 'payment_qr_codes', $3, $4)`,
    [actorId, action, targetId, JSON.stringify(details)]
  );
}

function isManagedQrImage(publicId) {
  return typeof publicId === 'string' && publicId.startsWith(QR_FOLDER);
}

// Best-effort Cloudinary cleanup. A missing image must not fail the DB change.
async function destroyQrImage(publicId) {
  if (!isManagedQrImage(publicId)) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('[payment-qr-codes] Cloudinary delete failed:', err.message);
  }
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validatePayload(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const number = typeof input.number === 'string' ? input.number.trim() : '';
  const imageUrl = typeof input.image_url === 'string' ? input.image_url.trim() : '';
  const publicId = typeof input.image_public_id === 'string' && input.image_public_id.trim()
    ? input.image_public_id.trim()
    : null;

  if (!name) return { error: 'Account name is required.' };
  if (name.length > 100) return { error: 'Account name must be 100 characters or fewer.' };
  if (!number) return { error: 'Account number is required.' };
  if (number.length > 50) return { error: 'Account number must be 50 characters or fewer.' };
  if (!imageUrl) return { error: 'A QR code image is required.' };
  if (imageUrl.length > 2048) return { error: 'Image URL is too long.' };
  if (publicId && publicId.length > 255) return { error: 'Image public id is too long.' };

  const displayOrder = input.display_order === undefined || input.display_order === null || input.display_order === ''
    ? 0
    : Number(input.display_order);
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
    return { error: 'Display order must be a whole number between 0 and 9999.' };
  }

  const isActive = input.is_active === undefined ? true : input.is_active;
  if (typeof isActive !== 'boolean') {
    return { error: 'is_active must be true or false.' };
  }

  return {
    value: {
      name,
      number,
      image_url: imageUrl,
      image_public_id: publicId,
      is_active: isActive,
      display_order: displayOrder,
    },
  };
}

// ─── GET /api/admin/system-settings/qr-codes ─────────────────────────────────
exports.listQrCodes = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${SELECT_COLUMNS}
         FROM payment_qr_codes
        ORDER BY display_order ASC, id ASC`
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('[listQrCodes]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// ─── POST /api/admin/system-settings/qr-codes ────────────────────────────────
exports.createQrCode = async (req, res) => {
  const client = await db.getClient();
  try {
    const { value, error } = validatePayload(req.body || {});
    if (error) return res.status(400).json({ message: error });

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO payment_qr_codes
         (name, number, image_url, image_public_id, is_active, display_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SELECT_COLUMNS}`,
      [
        value.name,
        value.number,
        value.image_url,
        value.image_public_id,
        value.is_active,
        value.display_order,
        req.user.sub,
      ]
    );
    const created = rows[0];

    await writeAuditLog(client, req.user.sub, 'create_payment_qr_code', created.id, {
      name: created.name,
      number: created.number,
    });

    await client.query('COMMIT');
    return res.status(201).json({ message: 'QR code added successfully.', data: created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[createQrCode]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─── PATCH /api/admin/system-settings/qr-codes/:id ───────────────────────────
exports.updateQrCode = async (req, res) => {
  const client = await db.getClient();
  try {
    const qrId = parseId(req.params.id);
    if (!qrId) return res.status(400).json({ message: 'Invalid QR code id.' });

    const { rows: existingRows } = await client.query(
      `SELECT ${SELECT_COLUMNS} FROM payment_qr_codes WHERE id = $1`,
      [qrId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'QR code not found.' });
    }
    const existing = existingRows[0];

    const merged = {
      name: req.body?.name ?? existing.name,
      number: req.body?.number ?? existing.number,
      image_url: req.body?.image_url ?? existing.image_url,
      image_public_id: req.body?.image_public_id ?? existing.image_public_id,
      is_active: req.body?.is_active ?? existing.is_active,
      display_order: req.body?.display_order ?? existing.display_order,
    };

    const { value, error } = validatePayload(merged);
    if (error) return res.status(400).json({ message: error });

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE payment_qr_codes
          SET name = $1,
              number = $2,
              image_url = $3,
              image_public_id = $4,
              is_active = $5,
              display_order = $6,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING ${SELECT_COLUMNS}`,
      [
        value.name,
        value.number,
        value.image_url,
        value.image_public_id,
        value.is_active,
        value.display_order,
        qrId,
      ]
    );
    const updated = rows[0];

    await writeAuditLog(client, req.user.sub, 'update_payment_qr_code', qrId, {
      name: updated.name,
      number: updated.number,
      is_active: updated.is_active,
      display_order: updated.display_order,
      image_changed: existing.image_public_id !== updated.image_public_id,
    });

    await client.query('COMMIT');

    // The row now points at the new image — remove the replaced one.
    if (existing.image_public_id && existing.image_public_id !== updated.image_public_id) {
      await destroyQrImage(existing.image_public_id);
    }

    return res.json({ message: 'QR code updated successfully.', data: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[updateQrCode]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};

// ─── DELETE /api/admin/system-settings/qr-codes/:id ──────────────────────────
exports.deleteQrCode = async (req, res) => {
  const client = await db.getClient();
  try {
    const qrId = parseId(req.params.id);
    if (!qrId) return res.status(400).json({ message: 'Invalid QR code id.' });

    const { rows } = await client.query(
      `SELECT ${SELECT_COLUMNS} FROM payment_qr_codes WHERE id = $1`,
      [qrId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'QR code not found.' });
    }
    const existing = rows[0];

    await client.query('BEGIN');
    await archiveRecord(client, {
      entityType: 'payment_qr_code',
      entityId: qrId,
      displayName: existing.name,
      payload: { record: existing },
      actorId: req.user.sub,
    });
    await client.query('DELETE FROM payment_qr_codes WHERE id = $1', [qrId]);
    await writeAuditLog(client, req.user.sub, 'archive_payment_qr_code', qrId, {
      name: existing.name,
      number: existing.number,
    });
    await client.query('COMMIT');

    return res.json({ message: 'QR code moved to the archive for 30 days.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[deleteQrCode]', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
};
