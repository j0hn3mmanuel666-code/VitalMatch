import multer from 'multer';
import { prescriptionType } from '../services/prescriptionService.js';
import { uploadLimiter, sanitizeInput } from './security.js';

const parse = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 80, fieldSize: 10000, parts: 81 } }).single('medicalPrescription');
// Multipart fields must be available to the existing CSRF check. Keep bytes in
// memory here; nothing is persisted before CSRF, validation and authorization.
export function prescriptionUpload(req, res, next) {
  if (req.method !== 'POST' || !req.is('multipart/form-data') ||
      !/^(?:\/(?:simple-blood-request|new-blood-request|blood-request|request-blood)|\/requests\/\d+\/correct)$/.test(req.path)) return next();
  if (!req.session?.userId) return res.redirect('/login');
  uploadLimiter(req, res, () => parse(req, res, error => {
    const type = req.file && prescriptionType(req.file.buffer);
    if (error || req.file && (!type || type !== req.file.mimetype)) {
      req.flash('error_msg', 'Choose one JPG, PNG, or WebP prescription image, up to 5 MB. Please select the image again.');
      return res.redirect('/new-blood-request');
    }
    sanitizeInput(req, res, next);
  }));
}
