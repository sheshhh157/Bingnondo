const express = require('express');
const router  = express.Router();
const { authenticateToken, requireStaff, requireRoles } = require('../../middleware/auth.middleware');
const { upload } = require('../../config/cloudinary');
const ctrl = require('./upload.controller');

const staffWrite = [authenticateToken, requireStaff, requireRoles('staff', 'owner', 'admin')];

// Multer error handler — converts multer errors to clean JSON responses
function handleMulterError(err, req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Image is too large. Maximum size is 5MB.' });
  }
  if (err?.message === 'Only image files are allowed.') {
    return res.status(415).json({ message: err.message });
  }
  next(err);
}

// POST /api/upload/menu-image  — upload a single image, get back { url, public_id }
router.post(
  '/menu-image',
  ...staffWrite,
  upload.single('image'),
  handleMulterError,
  ctrl.uploadMenuImage
);

// DELETE /api/upload/menu-image  — remove an image from Cloudinary by public_id
router.delete(
  '/menu-image',
  ...staffWrite,
  ctrl.deleteMenuImage
);

module.exports = router;