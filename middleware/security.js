/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'node:crypto';

// Rate limiting configurations
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: {
    error: 'Too many login attempts from this IP, please try again after 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    req.flash('error_msg', 'Too many login attempts. Please try again after 15 minutes.');
    res.redirect('/login');
  }
});

// Throttle for state-changing (POST/PUT/DELETE) endpoints: generous enough for
// normal use, tight enough to blunt abuse/credential-stuffing style floods.
// Login/register/password routes keep the stricter authLimiter; uploads keep uploadLimiter.
export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 mutations per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const acceptsHtml = (req.headers.accept || '').includes('text/html');
    if (acceptsHtml && typeof req.flash === 'function') {
      req.flash('error_msg', 'Too many requests. Please slow down and try again later.');
      return res.redirect('back');
    }
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Higher limit for API endpoints
  message: {
    error: 'API rate limit exceeded, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit file uploads
  message: {
    error: 'Upload limit exceeded, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https:"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "ws:", "wss:", "https:", "http:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false
});

// CORS configuration - locked to the configured frontend in production so any
// random website cannot make credentialed requests to the app.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
export const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? FRONTEND_URL : true,
  credentials: true,
  optionsSuccessStatus: 200
};

// Input sanitization middleware
export const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;

    // Remove potentially dangerous characters
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  };

  const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object') {
      for (let key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = sanitizeString(obj[key]);
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        }
      }
    }
  };

  // Sanitize request body
  if (req.body) {
    sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    sanitizeObject(req.query);
  }

  next();
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;

  res.send = function (data) {
    const duration = Date.now() - start;
    // Redact single-use tokens from logged URLs (password-reset and
    // schedule-confirm links carry the raw token in the path).
    const safeUrl = (req.originalUrl || '')
      .replace(/(\/reset-password\/)[^/?]+/, '$1[redacted]')
      .replace(/(\/schedule-confirm\/)[^/?]+/, '$1[redacted]')
      .replace(/([?&](token|_csrf)=)[^&]+/gi, '$1[redacted]');
    const logData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: safeUrl,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.session?.userId || 'anonymous'
    };

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`${logData.method} ${logData.url} - ${logData.statusCode} - ${logData.duration} - ${logData.ip}`);
    }

    // In production, you might want to log to a file or external service
    // logger.info(logData);

    originalSend.call(this, data);
  };

  next();
};

// Error handling middleware
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: isDevelopment ? err.message : 'Invalid input data'
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      details: isDevelopment ? err.message : 'Access denied'
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large',
      details: 'Please upload a smaller file'
    });
  }

  // HTML page requests get the error page; API/fetch callers get JSON.
  const acceptsHtml = (req.headers.accept || '').includes('text/html');
  if (acceptsHtml && !req.path.startsWith('/api')) {
    return res.status(500).render('error', {
      title: 'Server Error - VitalMatch',
      statusCode: 500,
      message: isDevelopment && err.message ? err.message : 'Something went wrong. Please try again.'
    });
  }

  // Default error response
  const response = {
    error: 'Internal Server Error',
    details: isDevelopment ? err.message : 'Something went wrong'
  };

  if (isDevelopment) {
    response.message = err.message;
  }

  res.status(500).json(response);
};

// Session security middleware
export const sessionSecurity = (req, res, next) => {
  // Skip session regeneration for now to avoid session loss issues
  // TODO: Implement proper session regeneration after login is complete
  next();
};

// CSRF protection (simple implementation)
export const csrfProtection = (req, res, next) => {
  // Always ensure a token exists and expose it to views (POSTs may re-render forms).
  // Cryptographically random; rotated automatically whenever the session is
  // regenerated (e.g. at login, which destroys the old session and its token).
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  // Verify CSRF token for POST/PUT/DELETE requests
  const token = req.body?._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    // Classic form posts get a friendly redirect; API/fetch callers get JSON
    const isFormPost = (req.headers.accept || '').includes('text/html') &&
      req.is('application/x-www-form-urlencoded');
    if (isFormPost && typeof req.flash === 'function') {
      req.flash('error_msg', 'Your session expired. Please try again.');
      return res.redirect('back');
    }
    return res.status(403).json({
      error: 'CSRF token mismatch',
      details: 'Invalid or missing CSRF token'
    });
  }

  next();
};