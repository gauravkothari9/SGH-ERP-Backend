const multer = require('multer');
const path = require('path');
const { AppError } = require('./errorHandler');

// ─── Storage: Documents (order attachments) ──────────────────────────────────
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/documents'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

// ─── Storage: Item images ────────────────────────────────────────────────────
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/images'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `img-${uniqueSuffix}${ext}`);
  },
});

// ─── Storage: Customer photos ────────────────────────────────────────────────
const customerPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/customers'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `customer-${uniqueSuffix}${ext}`);
  },
});

// ─── File filters ─────────────────────────────────────────────────────────────
const documentFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError(`File type ${ext} not allowed. Allowed: ${allowed.join(', ')}`, 400), false);
  }
};

// Accept any common image format — matches either by MIME type prefix
// (`image/*`) or by a permissive extension allowlist for formats browsers
// don't always tag correctly (HEIC, AVIF, TIFF, etc.). Minimum supported
// size is 5 MB per file; the hard cap below leaves generous headroom.
const imageFilter = (req, file, cb) => {
  const allowedExts = [
    '.jpg', '.jpeg', '.jpe', '.jfif',
    '.png', '.apng',
    '.webp', '.gif', '.bmp', '.dib',
    '.tif', '.tiff',
    '.svg', '.svgz',
    '.heic', '.heif', '.avif',
    '.ico', '.cur',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  if (mime.startsWith('image/') || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError(`Image type ${ext || mime || 'unknown'} not allowed.`, 400), false);
  }
};

// ─── Multer instances ─────────────────────────────────────────────────────────
const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: documentFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  },
});

const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per image
  },
});

const uploadCustomerPhoto = multer({
  storage: customerPhotoStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per image
  },
});

module.exports = { uploadDocument, uploadImage, uploadCustomerPhoto };
