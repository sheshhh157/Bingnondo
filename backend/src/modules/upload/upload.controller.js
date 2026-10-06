const { cloudinary } = require('../../config/cloudinary');

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

module.exports = { uploadMenuImage, deleteMenuImage };