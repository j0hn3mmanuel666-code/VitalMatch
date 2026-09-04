/*
MIT License

Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
Mindoro State University - Philippines
*/

import compression from 'compression';
import { createHash } from 'crypto';

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

// Cache control middleware
export const cacheControl = (maxAge = 3600) => {
  return (req, res, next) => {
    if (req.method === 'GET') {
      // Set cache headers for static assets
      if (req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        res.set('Cache-Control', `public, max-age=${maxAge * 24}`); // 24 hours for static assets
        res.set('ETag', createHash('md5').update(req.url).digest('hex'));
      } else {
        // Prevent caching for dynamic HTML routes and Authentication redirects
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      }
    }
    next();
  };
};

// Response time middleware
export const responseTime = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    // Only set header if response hasn't been sent yet
    if (!res.headersSent) {
      res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
    }
  });
  
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

// Simple in-memory cache for frequently accessed data
class SimpleCache {
  constructor(ttl = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  set(key, value) {
    const expiry = Date.now() + this.ttl;
    this.cache.set(key, { value, expiry });
    
    // Clean up expired entries periodically
    if (this.cache.size > 100) {
      this.cleanup();
    }
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  delete(key) {
    this.cache.delete(key);
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
  
  clear() {
    this.cache.clear();
  }
  
  size() {
    return this.cache.size;
  }
}

// Create cache instances
export const dataCache = new SimpleCache(300000); // 5 minutes
export const sessionCache = new SimpleCache(900000); // 15 minutes

// Cache middleware for API responses
export const apiCache = (ttl = 300000) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    const key = `api:${req.originalUrl}:${req.session?.userId || 'anonymous'}`;
    const cached = dataCache.get(key);
    
    if (cached) {
      if (!res.headersSent) {
        res.set('X-Cache', 'HIT');
      }
      return res.json(cached);
    }
    
    // Override res.json to cache the response
    const originalJson = res.json;
    res.json = function(data) {
      if (res.statusCode === 200) {
        dataCache.set(key, data);
        if (!res.headersSent) {
          res.set('X-Cache', 'MISS');
        }
      }
      originalJson.call(this, data);
    };
    
    next();
  };
};

// Database query optimization middleware
export const dbOptimization = (req, res, next) => {
  // Add query optimization hints
  req.dbOptions = {
    // Enable query result caching
    cache: true,
    // Set reasonable limits
    limit: req.query.limit ? Math.min(parseInt(req.query.limit), 100) : 20,
    offset: req.query.offset ? parseInt(req.query.offset) : 0,
    // Optimize includes
    include: req.query.include ? req.query.include.split(',').slice(0, 5) : []
  };
  
  next();
};

// Request size limiting
export const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    let size = 0;
    const limit = parseSize(maxSize);
    
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        res.status(413).json({
          error: 'Request too large',
          details: `Request size exceeds ${maxSize} limit`
        });
        return;
      }
    });
    
    next();
  };
};

// Helper function to parse size strings
function parseSize(size) {
  if (typeof size === 'number') return size;
  
  const units = {
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 1024 * 1024; // Default 1MB
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'b';
  
  return Math.floor(value * units[unit]);
}

// Performance monitoring
export const performanceMonitor = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    // Log slow requests
    if (duration > 1000) { // Requests taking more than 1 second
      console.warn(`Slow request detected: ${req.method} ${req.originalUrl} - ${duration.toFixed(2)}ms`);
    }
    
    // Store performance metrics (in production, you might send this to a monitoring service)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Performance: ${req.method} ${req.originalUrl} - ${duration.toFixed(2)}ms`);
    }
  });
  
  next();
};

// Graceful shutdown handler
export const gracefulShutdown = (server) => {
  const shutdown = (signal) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    
    server.close((err) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
      
      console.log('Server closed successfully');
      
      // Clean up resources
      dataCache.clear();
      sessionCache.clear();
      
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

// Health check endpoint
export const healthCheck = (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 60)} minutes`,
    memory: {
      used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
    },
    cache: {
      dataCache: dataCache.size(),
      sessionCache: sessionCache.size()
    }
  };
  
  res.json(health);
};