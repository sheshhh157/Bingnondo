const { cloudinary } = require('../../config/cloudinary');
const db = require('../../config/db');

async function uploadStaffProfileImage(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ message: 'No profile photo provided.' });
  }

  const uploadedPublicId = req.file.filename;
  let client;
  let oldPublicId = null;
  let committed = false;
  let commitAttempted = false;
  try {
    client = await db.getClient();
    await client.query('BEGIN');
    const { rows: currentRows } = await client.query(
      'SELECT profile_image_public_id FROM staff_accounts WHERE id = $1 FOR UPDATE',
      [req.user.sub]
    );
    if (!currentRows[0]) {
      await client.query('ROLLBACK');
      await cloudinary.uploader.destroy(uploadedPublicId);
      return res.status(404).json({ message: 'Staff account not found.' });
    }

    oldPublicId = currentRows[0].profile_image_public_id;
    const { rows } = await client.query(
      `UPDATE staff_accounts
          SET profile_image_url = $1,
              profile_image_public_id = $2,
              updated_at = NOW()
        WHERE id = $3
        RETURNING id, first_name, middle_name, last_name, full_name, email, role,
                  status, created_at, updated_at, profile_image_url`,
      [req.file.path, uploadedPublicId, req.user.sub]
    );
    commitAttempted = true;
    await client.query('COMMIT');
    committed = true;

    if (oldPublicId && oldPublicId !== uploadedPublicId && oldPublicId.startsWith('bingnondo/staff_profiles/')) {
      cloudinary.uploader.destroy(oldPublicId).catch((err) => {
        console.error('[cloudinary] failed to remove replaced profile photo:', err.message);
      });
    }
    return res.json({ message: 'Profile photo updated.', profile: { ...rows[0], type: 'staff' } });
  } catch (err) {
    if (client && !committed) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[uploadStaffProfileImage] rollback failed:', rollbackErr.message);
      }
    }
    if (!commitAttempted) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch (cleanupErr) {
        console.error('[cloudinary] failed to remove unlinked profile photo:', cleanupErr.message);
      }
    }
    return next(err);
  } finally {
    client?.release();
  }
}

async function uploadRiderProfileImage(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ message: 'No profile photo provided.' });
  }

  const uploadedPublicId = req.file.filename;
  let client;
  let oldPublicId = null;
  let committed = false;
  let commitAttempted = false;
  try {
    client = await db.getClient();
    await client.query('BEGIN');
    const { rows: currentRows } = await client.query(
      'SELECT profile_image_public_id FROM riders WHERE id = $1 FOR UPDATE',
      [req.user.sub]
    );
    if (!currentRows[0]) {
      await client.query('ROLLBACK');
      await cloudinary.uploader.destroy(uploadedPublicId);
      return res.status(404).json({ message: 'Rider account not found.' });
    }

    oldPublicId = currentRows[0].profile_image_public_id;
    const { rows } = await client.query(
      `UPDATE riders
          SET profile_image_url = $1,
              profile_image_public_id = $2,
              updated_at = NOW()
        WHERE id = $3
        RETURNING id, first_name, middle_name, last_name, full_name, email,
                  mobile_number, plate_number, vehicle_type, status, last_login,
                  profile_image_url`,
      [req.file.path, uploadedPublicId, req.user.sub]
    );
    commitAttempted = true;
    await client.query('COMMIT');
    committed = true;

    if (oldPublicId && oldPublicId !== uploadedPublicId && oldPublicId.startsWith('bingnondo/rider_profiles/')) {
      cloudinary.uploader.destroy(oldPublicId).catch((err) => {
        console.error('[cloudinary] failed to remove replaced rider profile photo:', err.message);
      });
    }
    return res.json({ message: 'Profile photo updated.', rider: rows[0] });
  } catch (err) {
    if (client && !committed) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[uploadRiderProfileImage] rollback failed:', rollbackErr.message);
      }
    }
    if (!commitAttempted) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch (cleanupErr) {
        console.error('[cloudinary] failed to remove unlinked rider profile photo:', cleanupErr.message);
      }
    }
    return next(err);
  } finally {
    client?.release();
  }
}

// ─── POST /api/upload/menu-image ─────────────────────────────────────────────
// Multer (via the route) already uploaded the file to Cloudinary by the time
// this handler runs. req.file contains the Cloudinary response.
async function uploadMenuImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided.' });
    }

    // multer-storage-cloudinary puts the secure URL in req.file.path
    res.status(201).json({
      url:       req.file.path,
      public_id: req.file.filename, // Cloudinary public_id for future deletion
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/upload/menu-image ───────────────────────────────────────────
// Called when a menu item is deleted or its photo is replaced, so the old
// image is removed from Cloudinary and doesn't accumulate as dead storage.
// Body: { public_id: 'bingnondo/menu/abc123' }
async function deleteMenuImage(req, res, next) {
  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ message: 'public_id is required.' });
    }

    // Only allow deletion of images in the bingnondo/menu folder
    if (!public_id.startsWith('bingnondo/menu/')) {
      return res.status(403).json({ message: 'Cannot delete files outside the menu folder.' });
    }

    const result = await cloudinary.uploader.destroy(public_id);

    if (result.result === 'not found') {
      return res.status(404).json({ message: 'Image not found on Cloudinary.' });
    }

    res.json({ message: 'Image deleted.', result: result.result });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/upload/qr-code ────────────────────────────────────────────────
// Admin-only. Multer has already streamed the file to Cloudinary.
async function uploadQrCode(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided.' });
    }

    res.status(201).json({
      url:       req.file.path,
      public_id: req.file.filename,
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/upload/qr-code ──────────────────────────────────────────────
// Body: { public_id: 'bingnondo/qr_codes/abc123' }
async function deleteQrCode(req, res, next) {
  try {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ message: 'public_id is required.' });
    }

    if (!String(public_id).startsWith('bingnondo/qr_codes/')) {
      return res.status(403).json({ message: 'Cannot delete files outside the QR code folder.' });
    }

    const result = await cloudinary.uploader.destroy(public_id);

    if (result.result === 'not found') {
      return res.status(404).json({ message: 'Image not found on Cloudinary.' });
    }

    res.json({ message: 'Image deleted.', result: result.result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadStaffProfileImage,
  uploadRiderProfileImage,
  uploadMenuImage,
  deleteMenuImage,
  uploadQrCode,
  deleteQrCode,
};