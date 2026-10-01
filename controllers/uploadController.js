/*
MIT License

Upload controller for admin image uploads
*/

import multer from "multer";
import fs from "fs";
import crypto from "node:crypto";

// Only these image types may be uploaded; the saved file extension is derived
// from this map (never from the uploader's filename).
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

// Storage for public images
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/uploads/images';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Derive the extension from the validated mimetype, never from the
    // client-supplied filename (blocks .svg/.html spoofing → stored XSS via
    // static serving, and executable uploads).
    const ext = EXT_BY_MIME[file.mimetype] || '.bin';
    const rand = crypto.randomBytes(8).toString('hex');
    cb(null, `img_${Date.now()}_${rand}${ext}`);
  }
});

export const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (Object.prototype.hasOwnProperty.call(EXT_BY_MIME, file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only images are allowed.'));
  }
});

// Handler to return uploaded image path
export const uploadImageHandler = (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = `/uploads/images/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
};
