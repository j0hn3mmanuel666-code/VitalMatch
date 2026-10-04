/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */

// Load environment variables first
import 'dotenv/config';

import express from "express";
import path from "path";
import session from "express-session";
import flash from "connect-flash";
import router from "./routes/index.js";
import fs from 'fs';
import hbs from "hbs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { SignalingServer } from "./services/signalingServer.js";
import { sequelize } from "./models/db.js";
import SequelizeStoreFactory from "connect-session-sequelize";

// Import security and performance middleware
import {
  generalLimiter,
  securityHeaders,
  corsOptions,
  sanitizeInput,
  requestLogger,
  errorHandler,
  sessionSecurity,
  csrfProtection,
  isAllowedOrigin,
  applyScriptNonce,
  blockLegacyVoiceMedia,
  apiLimiter,
  isApiRequest
} from "./middleware/security.js";
import {
  compressionMiddleware,
  cacheControl,
  responseTime,
  memoryMonitor,
  performanceMonitor,
  gracefulShutdown,
  healthCheck
} from "./middleware/performance.js";
import cors from 'cors';
import { asyncHandler } from './middleware/asyncHandler.js';
import { sessionLifetimeMs } from './services/sessionAuth.js';
import net from 'node:net';
import { startEmailOutboxWorker } from './services/emailOutboxWorker.js';
import { assertCurrentSchema } from './scripts/migrate-schema.js';
import { getRuntimeSettings } from './services/runtimeSettings.js';
import { getPublicPasswordPolicy } from './middleware/validation.js';
import { operatingStatusMiddleware } from './services/operatingStatus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const proxyConfig = process.env.TRUST_PROXY || '';
if (proxyConfig && !proxyConfig.split(',').every(value => {
  const item = value.trim();
  return ['loopback', 'linklocal', 'uniquelocal'].includes(item) || !!net.isIP(item.split('/')[0]);
})) throw new Error('TRUST_PROXY must list explicit trusted IP addresses or CIDRs.');
app.set('trust proxy', proxyConfig ? proxyConfig.split(',').map(value => value.trim()) : false);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions,
  allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin)),
  maxHttpBufferSize: 100000,
  transports: ['polling', 'websocket']
});
app.set('io', io);
const PORT = process.env.PORT || 3000;
const isDevelopment = process.env.NODE_ENV !== 'production';
const devReloadInstance = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let devReloadRevision = 0;
const devReloadClients = new Set();

function publishDevelopmentReload() {
  devReloadRevision += 1;
  const event = `event: reload\ndata: ${devReloadInstance}:${devReloadRevision}\n\n`;
  for (const client of devReloadClients) {
    try {
      client.write(event);
      if (typeof client.flush === 'function') client.flush();
    }
    catch { devReloadClients.delete(client); }
  }
}

// Security middleware (applied first)
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.locals.isDevelopment = isDevelopment;
  next();
});

// Performance middleware
app.use(compressionMiddleware);
app.use(responseTime);
app.use(memoryMonitor);
app.use(performanceMonitor);
app.use(cacheControl());

// Request logging
app.use(requestLogger);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 100, depth: 5 }));

// Sanitization must run AFTER body parsing, otherwise req.body is still
// undefined here and body sanitization silently does nothing.
app.use(sanitizeInput);

// Static files with enhanced caching
// Old private recordings stay intact on disk, but their historical public URLs
// are closed. Existing conversations use the authorized /messages/voice/:id route.
app.use(blockLegacyVoiceMedia);
app.use(express.static(path.join(process.cwd(), "public"), {
  maxAge: '1d', // 1 day cache for static assets
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const name=path.basename(filePath);
    res.set('Cache-Control', name==='sw.js' ? 'no-cache, no-store' : /\.(js|css|html|json)$/i.test(name) ? 'public, max-age=0, must-revalidate' : 'public, max-age=86400');
  }
}));

if (isDevelopment) {
  app.get('/__dev/events', (req, res) => {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    res.write(`event: ready\ndata: ${devReloadInstance}:${devReloadRevision}\n\n`);
    if (typeof res.flush === 'function') res.flush();
    devReloadClients.add(res);
    res.on('close', () => devReloadClients.delete(res));
  });
}

// Persistent session store (Sequelize/MySQL) - replaces default in-memory MemoryStore
// Schema changes, including Sessions, are applied through reviewed migrations.
// Application startup performs no schema mutations.
await assertCurrentSchema();

const SequelizeStore = SequelizeStoreFactory(session.Store);
const sessionTable = new SequelizeStore({
  db: sequelize,
  tableName: "Sessions",
  expiration: sessionLifetimeMs(),
  checkExpirationInterval: 15 * 60 * 1000 // Clean up expired sessions every 15 minutes
});

// Fail fast when the session secret is missing - a hardcoded fallback would let
// anyone forge session cookies.
if (!process.env.SESSION_SECRET) {
  throw new Error("❌ SESSION_SECRET is not set. Add it to your .env file before starting the server.");
}
if (process.env.NODE_ENV === 'production') {
  if (process.env.SESSION_SECRET.length < 32) throw new Error('Use a session secret of at least 32 characters in production.');
  if (!process.env.BASE_URL || new URL(process.env.BASE_URL).protocol !== 'https:') throw new Error('Production BASE_URL must be HTTPS.');
}

// Session configuration with enhanced security
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false, // Prevent race conditions on concurrent requests
  saveUninitialized: false, // Don't save empty sessions to prevent memory leaks
  name: 'vitalmatch.sid', // Custom session name
  store: sessionTable, // Persist sessions in MySQL so logins survive restarts
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS-only cookies in production
    httpOnly: true, // Prevent XSS
    maxAge: sessionLifetimeMs(),
    sameSite: 'lax' // Changed from false to 'lax' for better compatibility
  },
  rolling: false // Do not reset expiry on every asset request to prevent race conditions
});

app.use(sessionMiddleware);
app.use(sessionSecurity);
app.use(generalLimiter);
app.use((req, res, next) => isApiRequest(req) ? apiLimiter(req, res, next) : next());
app.use(flash());
// CSRF: issues a per-session token on GET (exposed as res.locals.csrfToken)
// and rejects POST/PUT/DELETE without a matching _csrf body field or X-CSRF-Token header
app.use(csrfProtection);

// Template engine configuration
app.engine("xian", async (filePath, options, callback) => {
  try {
    // Recursive fs.watch can miss nested template events on some Windows setups.
    // Reload partials at render time in development so the next request always
    // uses the edited sidebar/header templates even after a missed notification.
    if (isDevelopment) registerPartialsFromDisk();
    const defaultPartialsDir = path.join(__dirname, 'views', 'partials');
    const originalPartialsDir = hbs.partialsDir || defaultPartialsDir;

    hbs.partialsDir = defaultPartialsDir;

    const result = await new Promise((resolve, reject) => {
      hbs.__express(filePath, options, (err, html) => {
        if (err) return reject(err);
        resolve(html);
      });
    });

    hbs.partialsDir = originalPartialsDir;
    callback(null, applyScriptNonce(result, options.cspNonce));
  } catch (err) {
    callback(err);
  }
});

import { attachNavUser } from "./middleware/adminAuth.js";

// Flash messages middleware
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.user = req.session.user || null;
  res.locals.isAuthenticated = !!req.session.userId;
  res.locals.isAdmin = req.session.userRole?.toLowerCase() === 'admin';
  res.locals.appName = getRuntimeSettings().general.appName;
  res.locals.passwordPolicy = getPublicPasswordPolicy();

  // Authenticated pages contain account-specific data and must not be restored from browser cache.
  if (req.session.userId) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }

  // Service worker must always be fresh so clients pick up cache-version bumps.
  if (req.path === '/sw.js') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
  }

  next();
});

// Shared user-sidebar data (navUser/navDonor/unread counts) for all pages
app.use(asyncHandler(attachNavUser));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");

// Register Handlebars helpers
hbs.registerHelper('eq', function (a, b) {
  return a === b;
});

hbs.registerHelper('equals', function (a, b, options) {
  // Support both inline and block usage in templates.
  const isEqual = a === b;
  if (options && typeof options === 'object' && typeof options.fn === 'function') {
    return isEqual ? options.fn(this) : options.inverse(this);
  }
  return isEqual;
});

hbs.registerHelper('add', function (a, b) {
  return a + b;
});

hbs.registerHelper('formatDate', function (date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    timeZone: getRuntimeSettings().general.timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

hbs.registerHelper('formatTime', function (date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('en-US', {
    timeZone: getRuntimeSettings().general.timeZone,
    hour: '2-digit',
    minute: '2-digit'
  });
});

hbs.registerHelper('unless', function (conditional, options) {
  if (!conditional) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

const partialsDir = path.join(__dirname, "views/partials");
const registeredPartialNames = new Set();
function registerPartialsFromDisk() {
  const files = fs.readdirSync(partialsDir).filter(file => file.endsWith('.xian'));
  const nextNames = new Set();
  for (const file of files) {
    const partialName = file.replace(/\.xian$/, '');
    hbs.registerPartial(partialName, fs.readFileSync(path.join(partialsDir, file), 'utf8'));
    nextNames.add(partialName);
  }
  for (const oldName of registeredPartialNames) {
    if (!nextNames.has(oldName)) hbs.unregisterPartial(oldName);
  }
  registeredPartialNames.clear();
  nextNames.forEach(name => registeredPartialNames.add(name));
}
registerPartialsFromDisk();

if (isDevelopment) {
  let pendingRoots = new Set();
  let changeTimer;
  function queueDevelopmentReload(root) {
    pendingRoots.add(root);
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      const roots = pendingRoots;
      pendingRoots = new Set();
      if (roots.has(path.join(__dirname, 'views'))) {
        try { registerPartialsFromDisk(); }
        catch (error) { console.error('Development partial refresh failed:', error.message); }
      }
      publishDevelopmentReload();
    }, 180);
  }
  for (const root of [path.join(__dirname, 'views'), path.join(__dirname, 'public')]) {
    try {
      const watcher = fs.watch(root, { recursive: true }, () => queueDevelopmentReload(root));
      watcher.unref();
    } catch (error) {
      console.error(`Development live reload could not watch ${path.basename(root)}:`, error.message);
    }
  }
}

// Health check endpoint
app.get('/health', asyncHandler(healthCheck));

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: getRuntimeSettings().general.systemStatus,
    appName: getRuntimeSettings().general.appName,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Main routes
app.use(operatingStatusMiddleware);
app.use("/", router);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found - VitalMatch',
    message: 'The page you are looking for does not exist.'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize Socket.io signaling server
const signalingServer = new SignalingServer(io, sessionMiddleware);
app.set('signalingServer', signalingServer);
signalingServer.initialize();
const stopEmailWorker = startEmailOutboxWorker();
httpServer.on('close', stopEmailWorker);

// Graceful shutdown handling (closes HTTP, Socket.io, and DB connections)
gracefulShutdown(httpServer, io, sequelize);

// Stray async errors must never silently hang the process: log and exit so the
// Node watch mode or the service manager restarts from a clean state. Exception
// messages/stacks may contain SQL parameters, tokens or patient fields.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason?.name || 'Error', reason?.code || 'UNEXPECTED');
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error?.name || 'Error', error?.code || 'UNEXPECTED');
  process.exit(1);
});

export default app;
export { httpServer, io };

if (!process.env.ELECTRON) {
  httpServer.listen(PORT, () => {
    console.log(`🔥 XianFire running at http://localhost:${PORT}`);
    console.log(`🛡️  Security middleware enabled`);
    console.log(`⚡ Performance optimizations active`);
    console.log(`📊 Health check available at http://localhost:${PORT}/health`);
  });
}
