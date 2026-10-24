/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

// Input validation middleware
import crypto from "node:crypto";
import sanitizeMarkup from "sanitize-html";
import fs from "node:fs";
import { getRuntimeSettings } from "../services/runtimeSettings.js";

// One-way hash for single-use tokens (email verification, password reset,
// schedule confirmation). Only the hash is stored, so a database read alone
// cannot redeem pending tokens. Compare with hashToken(rawTokenFromUrl).
export const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

export const validateEmail = (email) => {
  if (typeof email !== 'string' || email.length > 254) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Only these non-secret policy fields may be exposed to public forms.
export const getPublicPasswordPolicy = (policy = getRuntimeSettings().security || {}) => ({
  minLength: Math.ceil(Math.max(8, Math.min(64, Number(policy?.minPasswordLength ?? policy?.minLength) || 8))),
  requireSpecialChars: Boolean(policy?.requireSpecialChars)
});

export const passwordPolicyMessage = (policy = getPublicPasswordPolicy()) => {
  const publicPolicy = getPublicPasswordPolicy(policy);
  return `Password must contain at least ${publicPolicy.minLength} characters, an uppercase letter, a lowercase letter, and a number${publicPolicy.requireSpecialChars ? ', plus a symbol from @$!%*?&' : ''}. Use only A-Z, a-z, 0-9, or @$!%*?&; the maximum is 72 UTF-8 bytes.`;
};

export const validatePassword = (password, policy = getRuntimeSettings().security || {}) => {
  // Bcrypt silently truncates beyond 72 bytes. Existing current-password checks
  // are separate; this policy applies to every newly chosen password.
  const publicPolicy = getPublicPasswordPolicy(policy);
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) return false;
  if (password.length < publicPolicy.minLength) return false;
  if (publicPolicy.requireSpecialChars && !/[@$!%*?&]/.test(password)) return false;
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

// Bcrypt cost factor, shared by every password hash in the app.
export const getBcryptRounds = () => Math.max(7, Math.min(15, parseInt(process.env.BCRYPT_ROUNDS, 10) || 12));

export const validatePhoneNumber = (phone) => {
  if (typeof phone !== 'string' || phone.length > 24) return false;
  // Philippine phone number format
  const phoneRegex = /^(\+63|0)?[0-9]{10}$/;
  return phoneRegex.test(phone.replace(/\s|-/g, ''));
};

export const validateBloodType = (bloodType) => {
  const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  return validBloodTypes.includes(bloodType);
};

export const validateAge = (age) => {
  const numAge = parseInt(age);
  return numAge >= 18 && numAge <= 65;
};

export const validateWeight = (weight) => {
  const numWeight = parseFloat(weight);
  return numWeight >= 50 && numWeight <= 200; // kg
};

// Registration validation middleware
export const validateRegistration = (req, res, next) => {
  const { firstName, lastName, email, password, confirmPassword, phone, dateOfBirth, gender, address, role } = req.body;
  const errors = [];

  // Required fields
  if (typeof firstName !== 'string' || firstName.trim().length < 2 || firstName.length > 100) {
    errors.push('First name must be at least 2 characters long');
  }

  if (typeof lastName !== 'string' || lastName.trim().length < 2 || lastName.length > 100) {
    errors.push('Last name must be at least 2 characters long');
  }

  if (!email || !validateEmail(email)) {
    errors.push('Please provide a valid email address');
  }

  if (!password || !validatePassword(password)) {
    errors.push(passwordPolicyMessage());
  }

  if (password !== confirmPassword) {
    errors.push('Passwords do not match');
  }

  if (!phone || !validatePhoneNumber(phone)) {
    errors.push('Please provide a valid Philippine phone number');
  }

  if (!dateOfBirth) {
    errors.push('Please select your date of birth');
  }

  if (!gender) {
    errors.push('Please select your gender');
  }

  if (typeof address !== 'string' || address.trim().length < 5 || address.length > 1000) {
    errors.push('Please provide your complete address');
  }

  // Public registration is donor-only: hospital accounts are issued by an admin.
  // Reject forged role values instead of silently accepting them.
  if (role && (typeof role !== 'string' || role.toLowerCase() !== 'donor')) {
    errors.push('Invalid account type selected');
  }

  if (errors.length > 0) {
    if (req.get?.('Accept')?.includes('application/json')) return res.status(400).json({ success: false, error: errors.join('. ') });
    return res.render('register', { error: errors.join('. ') });
  }

  next();
};

// Login validation middleware
export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || !validateEmail(email)) {
    errors.push('Please provide a valid email address');
  }

  if (typeof password !== 'string' || !password.length || Buffer.byteLength(password, 'utf8') > 72) {
    errors.push('Please provide a password');
  }

  if (errors.length > 0) {
    req.flash('error_msg', errors.join('. '));
    return res.status(400).render('login', { title: 'Login', error: errors.join('. ') });
  }

  next();
};

// Blood request validation middleware
export const validateBloodRequest = (req, res, next) => {
  // Both request controllers use normalizeRequestInput as the authoritative
  // schema and preserve submitted fields for correction. The global shape guard
  // runs first; do not duplicate a legacy schema or lose the form on redirect.
  next();
};

// Profile update validation middleware
export const validateProfileUpdate = (req, res, next) => {
  const { firstName, lastName, phone, bloodType, age, weight, address, emergencyContact, emergencyPhone } = req.body;
  const errors = [];

  if (firstName && (typeof firstName !== 'string' || firstName.trim().length < 2)) {
    errors.push('First name must be at least 2 characters long');
  }

  if (lastName && (typeof lastName !== 'string' || lastName.trim().length < 2)) {
    errors.push('Last name must be at least 2 characters long');
  }

  if (phone && !validatePhoneNumber(phone)) {
    errors.push('Please provide a valid Philippine phone number');
  }

  if (bloodType && !validateBloodType(bloodType)) {
    errors.push('Please select a valid blood type');
  }

  if (age && !validateAge(age)) {
    errors.push('Age must be between 18 and 65 years');
  }

  if (weight && !validateWeight(weight)) {
    errors.push('Weight must be between 50 and 200 kg');
  }

  if (address && (typeof address !== 'string' || address.trim().length < 10)) {
    errors.push('Address must be at least 10 characters long');
  }

  if (emergencyContact && (typeof emergencyContact !== 'string' || emergencyContact.trim().length < 2)) {
    errors.push('Emergency contact name must be at least 2 characters long');
  }

  if (emergencyPhone && !validatePhoneNumber(emergencyPhone)) {
    errors.push('Please provide a valid emergency contact phone number');
  }

  if (errors.length > 0) {
    req.flash('error_msg', errors.join('. '));
    return res.redirect('/donor-profile');
  }

  next();
};

// Admin user creation validation
export const validateAdminUserCreation = (req, res, next) => {
  const { firstName, lastName, email, role, phone, bloodType, address, dateOfBirth, gender, hospitalName, facilityId } = req.body;
  const errors = [];

  if (typeof firstName !== 'string' || firstName.trim().length < 2 || firstName.length > 100) {
    errors.push('First name must be at least 2 characters long');
  }

  if (typeof lastName !== 'string' || lastName.trim().length < 2 || lastName.length > 100) {
    errors.push('Last name must be at least 2 characters long');
  }

  if (!email || !validateEmail(email)) {
    errors.push('Please provide a valid email address');
  }

  // The service generates a cryptographically random temporary password. The
  // admin form never submits one; creation must validate the actual form schema.
  const validRoles = ['user', 'donor', 'hospital', 'admin'];
  if (!role || !validRoles.includes(role)) {
    errors.push('Please select a valid role');
  }

  if (phone && !validatePhoneNumber(phone)) {
    errors.push('Please provide a valid Philippine phone number');
  }

  if (bloodType && !validateBloodType(bloodType)) {
    errors.push('Please select a valid blood type');
  }
  if (typeof address !== 'string' || address.trim().length < 5 || address.length > 1000) errors.push('Please provide a valid address');
  const birth = typeof dateOfBirth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ? new Date(dateOfBirth) : null;
  if (!birth || !Number.isFinite(birth.getTime()) || birth >= new Date() || birth.toISOString().slice(0, 10) !== dateOfBirth) errors.push('Please provide a valid past date of birth');
  if (typeof gender !== 'string' || !['male', 'female', 'other'].includes(gender.toLowerCase())) errors.push('Please select a valid gender');
  if (role === 'hospital' && !(typeof hospitalName === 'string' && hospitalName.trim().length >= 2) && !(Number.isSafeInteger(Number(facilityId)) && Number(facilityId) > 0)) errors.push('Please select a verified facility or provide a facility name');

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors
    });
  }

  next();
};

// File upload validation
export const validateFileUpload = (allowedTypes = [], maxSize = 5 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file) {
      return next();
    }

    const file = req.file;
    const errors = [];

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      errors.push(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size ${Math.round(file.size / 1024 / 1024)}MB exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Check filename for security
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      errors.push('Invalid filename detected');
    }

    if (errors.length > 0) {
      if (file.path) { try { fs.unlinkSync(file.path); } catch { /* best effort cleanup of this rejected upload only */ } }
      return res.status(400).json({
        success: false,
        message: 'File validation failed',
        errors: errors
      });
    }

    next();
  };
};

// API parameter validation
export const validateApiParams = (requiredParams = [], optionalParams = []) => {
  return (req, res, next) => {
    const errors = [];
    const allParams = [...requiredParams, ...optionalParams];

    // Check required parameters
    for (const param of requiredParams) {
      if (!req.body[param] && !req.query[param] && !req.params[param]) {
        errors.push(`Missing required parameter: ${param}`);
      }
    }

    // Check for unexpected parameters
    const providedParams = [...Object.keys(req.body || {}), ...Object.keys(req.query || {}), ...Object.keys(req.params || {})];
    for (const param of providedParams) {
      if (!allParams.includes(param) && param !== '_csrf') {
        errors.push(`Unexpected parameter: ${param}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Parameter validation failed',
        errors: errors
      });
    }

    next();
  };
};

// Sanitize rich HTML (e.g. CMS content): keeps basic formatting tags but strips
// executable content - script/style/iframe/object/embed/form tags, event handler
// attributes (onclick, ...), and javascript:/data:/vbscript: URLs.
export const sanitizeRichHtml = (input) => {
  if (typeof input !== 'string') return input;
  return sanitizeMarkup(input, {
    allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'b', 'i', 'em', 'strong', 'u', 'ul', 'ol', 'li', 'a', 'blockquote', 'span', 'img'],
    allowedAttributes: { a: ['href', 'title', 'rel'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['https', 'http'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (_tag, attrs) => ({ tagName: 'a', attribs: { ...attrs, rel: 'noopener noreferrer' } })
    },
    parser: { decodeEntities: true }
  });
};
// Sanitize HTML input
export const sanitizeHtml = (input) => {
  if (typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// SQL injection prevention
export const preventSqlInjection = (input) => {
  if (typeof input !== 'string') return input;

  const sqlKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'EXEC', 'EXECUTE',
    'UNION', 'SCRIPT', 'JAVASCRIPT', 'VBSCRIPT', 'ONLOAD', 'ONERROR', 'ONCLICK'
  ];

  let sanitized = input;
  for (const keyword of sqlKeywords) {
    const regex = new RegExp(keyword, 'gi');
    sanitized = sanitized.replace(regex, '');
  }

  return sanitized
    .replace(/[';\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '');
};
