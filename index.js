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

// Import security and performance middleware
import {
  generalLimiter,
  securityHeaders,
  corsOptions,
  sanitizeInput,
  requestLogger,
  errorHandler,
  sessionSecurity
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions
});
const PORT = process.env.PORT || 3000;

// Security middleware (applied first)
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(generalLimiter);
app.use(sanitizeInput);

// Performance middleware
app.use(compressionMiddleware);
app.use(responseTime);
app.use(memoryMonitor);
app.use(performanceMonitor);
app.use(cacheControl(3600)); // 1 hour cache

// Request logging
app.use(requestLogger);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with enhanced caching
app.use(express.static(path.join(process.cwd(), "public"), {
  maxAge: '1d', // 1 day cache for static assets
  etag: true,
  lastModified: true
}));

// Session configuration with enhanced security
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "xianfire-secret-key-change-in-production",
  resave: false, // Prevent race conditions on concurrent requests
  saveUninitialized: false, // Don't save empty sessions to prevent memory leaks
  name: 'vitalmatch.sid', // Custom session name
  cookie: {
    secure: false, // Always false for development
    httpOnly: true, // Prevent XSS
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Changed from false to 'lax' for better compatibility
  },
  rolling: false // Do not reset expiry on every asset request to prevent race conditions
});

app.use(sessionMiddleware);
app.use(sessionSecurity);
app.use(flash());

// Template engine configuration
app.engine("xian", async (filePath, options, callback) => {
  try {
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
    callback(null, result);
  } catch (err) {
    callback(err);
  }
});

// Flash messages middleware
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.user = req.session.user || null;
  res.locals.isAuthenticated = !!req.session.userId;
  res.locals.isAdmin = req.session.userRole?.toLowerCase() === 'admin';

  // Authenticated pages contain account-specific data and must not be restored from browser cache.
  if (req.session.userId) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }

  next();
});

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
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

hbs.registerHelper('formatTime', function (date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('en-US', {
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

// Register partials
const partialsDir = path.join(__dirname, "views/partials");
fs.readdir(partialsDir, (err, files) => {
  if (err) {
    console.error("❌ Could not read partials directory:", err);
    return;
  }

  files
    .filter(file => file.endsWith('.xian'))
    .forEach(file => {
      const partialName = file.replace('.xian', '');
      const fullPath = path.join(partialsDir, file);

      fs.readFile(fullPath, 'utf8', (err, content) => {
        if (err) {
          console.error(`❌ Failed to read partial: ${file}`, err);
          return;
        }
        hbs.registerPartial(partialName, content);
      });
    });
});

// Health check endpoint
app.get('/health', healthCheck);

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Main routes
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
signalingServer.initialize();

// Graceful shutdown handling
gracefulShutdown(httpServer);

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