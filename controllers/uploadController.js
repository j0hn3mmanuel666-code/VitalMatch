/*
MIT License

Upload controller for admin image uploads
*/

import multer from "multer";
import fs from "fs";

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
    const ext = file.originalname.split('.').pop();
    const safe = `img_${Date.now()}_${Math.random().toString(36).substring(2,9)}.${ext}`;
    cb(null, safe);
  }
});

export const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
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
