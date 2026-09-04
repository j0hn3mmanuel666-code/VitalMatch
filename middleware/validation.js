/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

// Input validation middleware
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

export const validatePhoneNumber = (phone) => {
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
  if (!firstName || firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters long');
  }

  if (!lastName || lastName.trim().length < 2) {
    errors.push('Last name must be at least 2 characters long');
  }

  if (!email || !validateEmail(email)) {
    errors.push('Please provide a valid email address');
  }

  if (!password || !validatePassword(password)) {
    errors.push('Password must be at least 8 characters with uppercase, lowercase, and number');
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

  if (!address || address.trim().length < 5) {
    errors.push('Please provide your complete address');
  }

  if (role && !['donor', 'hospital'].includes(role.toLowerCase())) {
    errors.push('Invalid account type selected');
  }

  if (errors.length > 0) {
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

  if (!password || password.length < 1) {
    errors.push('Please provide a password');
  }

  if (errors.length > 0) {
    req.flash('error_msg', errors.join('. '));
    return res.redirect('/login');
  }

  next();
};

// Blood request validation middleware
export const validateBloodRequest = (req, res, next) => {
  const { patientName, bloodType, unitsRequired, urgency, hospitalName, contactPerson, contactNumber, notes } = req.body;
  const errors = [];

  if (!patientName || patientName.trim().length < 2) {
    errors.push('Patient name must be at least 2 characters long');
  }

  if (!bloodType || !validateBloodType(bloodType)) {
    errors.push('Please select a valid blood type');
  }

  const units = parseInt(unitsRequired);
  if (!units || units < 1 || units > 10) {
    errors.push('Units required must be between 1 and 10');
  }

  const validUrgencyLevels = ['moderate', 'urgent', 'critical'];
  if (!urgency || !validUrgencyLevels.includes(urgency)) {
    errors.push('Please select a valid urgency level');
  }

  if (!hospitalName || hospitalName.trim().length < 2) {
    errors.push('Hospital name must be at least 2 characters long');
  }

  if (!contactPerson || contactPerson.trim().length < 2) {
    errors.push('Contact person name must be at least 2 characters long');
  }

  if (!contactNumber || !validatePhoneNumber(contactNumber)) {
    errors.push('Please provide a valid contact phone number');
  }

  if (notes && notes.trim().length > 0 && notes.trim().length < 5) {
    errors.push('Additional notes must be at least 5 characters long if provided');
  }

  if (errors.length > 0) {
    req.flash('error_msg', errors.join('. '));
    return res.redirect('/new-blood-request');
  }

  next();
};

// Profile update validation middleware
export const validateProfileUpdate = (req, res, next) => {
  const { firstName, lastName, phone, bloodType, age, weight, address, emergencyContact, emergencyPhone } = req.body;
  const errors = [];

  if (firstName && firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters long');
  }

  if (lastName && lastName.trim().length < 2) {
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

  if (address && address.trim().length < 10) {
    errors.push('Address must be at least 10 characters long');
  }

  if (emergencyContact && emergencyContact.trim().length < 2) {
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
  const { firstName, lastName, email, password, role, phone, bloodType } = req.body;
  const errors = [];

  if (!firstName || firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters long');
  }

  if (!lastName || lastName.trim().length < 2) {
    errors.push('Last name must be at least 2 characters long');
  }

  if (!email || !validateEmail(email)) {
    errors.push('Please provide a valid email address');
  }

  if (!password || !validatePassword(password)) {
    errors.push('Password must be at least 8 characters with uppercase, lowercase, and number');
  }

  const validRoles = ['user', 'admin', 'hospital'];
  if (!role || !validRoles.includes(role)) {
    errors.push('Please select a valid role');
  }

  if (phone && !validatePhoneNumber(phone)) {
    errors.push('Please provide a valid Philippine phone number');
  }

  if (bloodType && !validateBloodType(bloodType)) {
    errors.push('Please select a valid blood type');
  }

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
    const providedParams = [...Object.keys(req.body), ...Object.keys(req.query), ...Object.keys(req.params)];
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