/**
 * receiptUpload.js
 * ────────────────
 * Multer instance for customer-uploaded GCash receipt screenshots.
 *
 * Separate from the menu-image uploader because the two live in different
 * Cloudinary folders and have different size limits — a receipt is a phone
 * screenshot, which is larger and sometimes not a square photo.
 */

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'bingnondo/receipts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      // Keep the full receipt readable — no crop, just a sane upper bound.
      { width: 1600, height: 1600, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' },
    ],
  },
});

const receiptUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  },
});

/** Converts a multer error into a clean JSON response. */
function handleReceiptUploadError(err, req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Image is too large. Maximum size is 8MB.' });
  }
  if (err?.message === 'Only image files are allowed.') {
    return res.status(415).json({ message: err.message });
  }
  next(err);
}

module.exports = { receiptUpload, handleReceiptUploadError };
