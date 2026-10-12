/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import { loadSessionAccount, destroySession, sessionLifetimeMs } from '../services/sessionAuth.js';
import { safeRequestLabel } from './performance.js';
import { canonicalRole } from '../services/accountPolicy.js';

// Rate limiting configurations
export const accountRateLimitKey = req => Number.isSafeInteger(Number(req.authAccount?.id)) && Number(req.authAccount.id) > 0
  ? `user:${req.authAccount.id}` : ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
export const isApiRequest = req => req.path.startsWith('/api/') || req.path === '/admin/users/api';
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: req => req.authAccount ? 300 : 100,
  keyGenerator: accountRateLimitKey,
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => /^\/(?:css|js|images|fonts|icons)\//.test(req.path) || ['/sw.js', '/manifest.json', '/tailwind.css', '/offline.html'].includes(req.path) || Boolean(req.authAccount && req.method === 'GET' && isApiRequest(req)),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
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
  // Rendering a form or returning HTTP 200 is not successful authentication.
  // Only a login that established an authenticated session avoids the failure
  // budget. Registration/reset/resend requests remain counted for abuse control.
  requestWasSuccessful: (req, res) => req.path === '/login' && Boolean(req.session?.userId) && res.statusCode < 400,
  handler: (req, res) => {
    const message = 'Too many attempts. Please wait 15 minutes and try again.';
    // Form posts re-render their page with a visible warning instead of raw JSON.
    const formViews = {
      '/login': 'login',
      '/register': 'register',
      '/forgot-password': 'forgotpassword'
    };
    const view = formViews[req.path];
    if (view) {
      if (typeof req.flash === 'function') req.flash('error_msg', message);
      return res.status(429).render(view, {
        title: view === 'login' ? 'Login' : view === 'register' ? 'Register' : 'Forgot Password',
        error: message,
        error_msg: message
      });
    }
    if (req.path.startsWith('/reset-password')) {
      if (typeof req.flash === 'function') req.flash('error_msg', message);
      return res.status(429).render('reset-password', { title: 'Reset Password', tokenValid: false, error_msg: message });
    }
    res.status(429).json({ error: 'Too many authentication attempts. Please try again after 15 minutes.' });
  }
});

// Throttle for state-changing (POST/PUT/DELETE) endpoints: generous enough for
// normal use, tight enough to blunt abuse/credential-stuffing style floods.
// Login/register/password routes keep the stricter authLimiter; uploads keep uploadLimiter.
export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Per authenticated account, or anonymous effective IP
  keyGenerator: accountRateLimitKey,
  skip: req => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  message: {
    error: 'Too many requests, please try again later.',
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
      error: 'Too many requests, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 600,
  keyGenerator: accountRateLimitKey,
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
  keyGenerator: accountRateLimitKey,
  message: {
    error: 'Upload limit exceeded, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Security headers middleware
const helmetHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", (_req, res) => `'nonce-${res.locals.cspNonce}'`, "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
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
export const securityHeaders = (req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(18).toString('base64');
  return helmetHeaders(req, res, next);
};
export const applyScriptNonce = (html, nonce) => html.replace(/<script\b([^>]*)>/gi, (_tag, attributes) =>
  `<script${attributes.replace(/\snonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')} nonce="${nonce}">`);
export const blockLegacyVoiceMedia = (req, res, next) => {
  let requestedPath;
  try { requestedPath = path.posix.normalize(decodeURIComponent(req.path).replace(/\\/g, '/')); }
  catch { return res.sendStatus(400); }
  // serve-static decodes URLs after route matching, so checking only a mounted
  // raw path would permit encoded slashes, dot segments or Windows separators.
  if (/^\/uploads\/voice-messages(?:\/|$)/i.test(requestedPath)) return res.sendStatus(404);
  next();
};

// CORS configuration - locked to the configured frontend in production so any
// random website cannot make credentialed requests to the app.
const configuredOrigin = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';
export const FRONTEND_ORIGIN = new URL(configuredOrigin).origin;
export const isAllowedOrigin = (origin) => !origin || origin === FRONTEND_ORIGIN ||
  (process.env.NODE_ENV !== 'production' && ['http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin));
export const corsOptions = {
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
  optionsSuccessStatus: 200
};

// Input sanitization middleware
export const sanitizeInput = (req, res, next) => {
  // Output escaping and the CMS HTML parser handle XSS. Do not rewrite passwords
  // or medical text using regexes; reject malformed request shapes instead.
  const nestedFields = new Set(['metadata', 'updates', 'userIds', 'bloodComponents', 'bloodComponents[]']);
  const checkTree = (value, depth = 0) => {
    if (depth > 5) return false;
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
      return typeof value !== 'string' || value.length <= 10000;
    }
    if (typeof value !== 'object' || Object.keys(value).length > 100) return false;
    return Object.entries(value).every(([key, child]) => !['__proto__', 'constructor', 'prototype'].includes(key) && checkTree(child, depth + 1));
  };
  const body = req.body || {};
  const malformed = !checkTree(body) || Object.entries(body).some(([key, value]) =>
    value !== null && typeof value === 'object' && !nestedFields.has(key)) ||
    Object.values(req.query || {}).some(value => typeof value !== 'string' || value.length > 2000);
  if (malformed) return res.status(400).json({ success: false, error: 'Invalid request data' });
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
    const safeUrl = safeRequestLabel(req).slice(req.method.length + 1);
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

    return originalSend.call(this, data);
  };

  next();
};

// Error handling middleware
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  // SQL errors can include bound patient fields or password/token values. Log
  // the error class and code, never the full exception or submitted payload.
  console.error('Request failed:', err.name || 'Error', err.code || 'UNEXPECTED');

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (['entity.too.large', 'parameters.too.many'].includes(err.type)) return res.status(413).json({ error: 'Request too large' });
  if (err.type === 'entity.parse.failed' || err.type === 'querystring.parse.rangeError') return res.status(400).json({ error: 'Invalid request data' });
  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'INVALID_MEDIA') return res.status(400).json({ error: 'Unsupported upload' });

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
export const sessionSecurity = async (req, res, next) => {
  try {
    if (req.session?.userId) {
      const account = await loadSessionAccount(req.session);
      if (!account) return destroySession(req, res);
      req.authAccount = account;
      req.session.userRole = canonicalRole(account.role);
      req.session.cookie.maxAge = sessionLifetimeMs();
    }
    next();
  } catch (error) { next(error); }
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
  const expected = req.session.csrfToken;
  if (typeof token !== 'string' || typeof expected !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
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
