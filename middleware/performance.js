/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import compression from 'compression';

// Compression middleware
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Compression level (1-9, 6 is default)
  threshold: 1024, // Only compress responses larger than 1KB
});

// Dynamic responses remain private even when a route ends in a file extension.
// Only express.static can override this for an actual public asset on disk.
export const cacheControl = () => (req,res,next) => {
  if (['GET','HEAD'].includes(req.method)) {
    res.set('Cache-Control','private, no-store, no-cache, must-revalidate');
    res.set('Pragma','no-cache');res.set('Expires','0');
  }
  next();
};

// Response time middleware
export const responseTime = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  const writeHead = res.writeHead;
  res.writeHead = function(...args) {
    if (!res.headersSent) res.set('X-Response-Time', `${(Number(process.hrtime.bigint() - start) / 1000000).toFixed(2)}ms`);
    return writeHead.apply(this,args);
  };
  
  next();
};

// Memory usage monitoring
export const memoryMonitor = (req, res, next) => {
  const memUsage = process.memoryUsage();
  
  // Log memory usage if it's getting high
  const memoryThreshold = 100 * 1024 * 1024; // 100MB
  if (memUsage.heapUsed > memoryThreshold) {
    console.warn(`High memory usage detected: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  }
  
  // Add memory info to response headers in development (only if headers not sent)
  if (process.env.NODE_ENV !== 'production' && !res.headersSent) {
    res.set('X-Memory-Usage', `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  }
  
  next();
};

// Performance monitoring
export const safeRequestLabel = req => `${req.method} ${String(req.originalUrl || req.url || '').split('?')[0].replace(/\/(reset-password|schedule-confirm)\/[^/]+/g, '/$1/[redacted]')}`;
export const performanceMonitor = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    // Log slow requests
    if (duration > 1000) { // Requests taking more than 1 second
      console.warn(`Slow request detected: ${safeRequestLabel(req)} - ${duration.toFixed(2)}ms`);
    }
    
    // Store performance metrics (in production, you might send this to a monitoring service)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Performance: ${safeRequestLabel(req)} - ${duration.toFixed(2)}ms`);
    }
  });
  
  next();
};

// Graceful shutdown handler
export const gracefulShutdown = (server, io, sequelize) => {
  const shutdown = (signal) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);

    server.close(async (err) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }

      console.log('Server closed successfully');

      // Clean up resources

      try {
        if (io) {
          await io.close();
          console.log('Socket.io closed');
        }
      } catch (e) {
        console.error('Error closing Socket.io:', e.message);
      }

      try {
        if (sequelize) {
          await sequelize.close();
          console.log('Database connection closed');
        }
      } catch (e) {
        console.error('Error closing database:', e.message);
      }

      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

// Health check endpoint (verifies the database too - reports degraded instead
// of healthy when MySQL is unreachable)
export const healthCheck = async (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();

  let db = 'up';
  try {
    const { sequelize } = await import('../models/db.js');
    await sequelize.authenticate();
  } catch (e) {
    db = 'down';
  }

  const health = {
    status: db === 'up' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 60)} minutes`,
    db,
    memory: {
      used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
    }
  };

  res.status(db === 'up' ? 200 : 503).json(health);
};
