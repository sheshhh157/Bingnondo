const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Multer storage: upload directly to Cloudinary ───────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'bingnondo/menu',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      // Resize to a consistent square thumbnail — good for menu cards
      { width: 600, height: 600, crop: 'fill', gravity: 'auto', quality: 'auto:good', fetch_format: 'auto' },
    ],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  },
});

// ─── Multer storage: receipts ────────────────────────────────────────────────
const receiptStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'bingnondo/receipts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    transformation: [
      { quality: 'auto:good', fetch_format: 'auto' },
    ],
  },
});

const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only image or PDF receipts are allowed.'));
    }
    cb(null, true);
  },
});

// ─── Multer storage: payment QR codes ────────────────────────────────────────
// QR codes need to stay sharp, so no resizing — only format/quality tuning.
const qrStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'bingnondo/qr_codes',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { quality: 'auto:good', fetch_format: 'auto' },
    ],
  },
});

const uploadQr = multer({
  storage: qrStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  },
});

function createProfileImageStorage(folder) {
  return new CloudinaryStorage({
    cloudinary,
    params: {
      folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [
        { width: 512, height: 512, crop: 'fill', gravity: 'face', quality: 'auto:good', fetch_format: 'auto' },
      ],
    },
  });
}

function createProfileImageUpload(folder) {
  return multer({
    storage: createProfileImageStorage(folder),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.mimetype)) {
        return cb(new Error('Profile photo must be JPG, PNG, or WEBP.'));
      }
      cb(null, true);
    },
  });
}

const uploadProfileImage = createProfileImageUpload('bingnondo/staff_profiles');
const uploadRiderProfileImage = createProfileImageUpload('bingnondo/rider_profiles');

module.exports = {
  cloudinary,
  upload,
  uploadReceipt,
  uploadQr,
  uploadProfileImage,
  uploadRiderProfileImage,
};