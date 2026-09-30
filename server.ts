import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db.js';
import { router as apiRouter } from './server/routes.js';
import { observability } from './server/services/metrics.js';
import { generalLimiter } from './server/services/rate-limiter.js';
import { backupService } from './server/services/backup.js';

async function startServer() {
  // Initialize SQLite database, schema, and tables
  initDatabase();

  const app = express();
  const PORT = 3000;

  // Enable trust proxy for accurate client IP resolution behind load balancers / reverse proxies
  app.set('trust proxy', 1);

  // Disable 'x-powered-by' header to prevent server fingerprinting
  app.disable('x-powered-by');

  // Security Headers Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    
    // Frame protection: Permit iframe embedding in AI Studio and Google Cloud environments
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.google.com https://*.run.app https://*.aistudio.google.com https://*.corp.google.com;");

    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Strict CORS Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    
    // Allow same-origin requests or trusted preview domains
    if (origin) {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ];

      const isAllowedOrigin = 
        allowedOrigins.includes(origin) ||
        origin.endsWith('.run.app') ||
        origin.endsWith('.google.com') ||
        origin.endsWith('.aistudio.google.com');

      if (isAllowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  // Latency & Traffic Observability Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      observability.recordRequest(req.method, req.originalUrl || req.url, res.statusCode, duration);
    });
    next();
  });

  // Body parser with strict size limit (2MB prevents memory exhaustion DoS)
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // General rate limiter for all API routes
  app.use('/api', generalLimiter);

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'StudyFlow API',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  });

  // Detailed Health, Observability Metrics & Database Integrity Check
  app.get('/api/health/detailed', (req: Request, res: Response) => {
    const integrity = backupService.checkIntegrity();
    res.json({
      ...observability.getSnapshot(),
      databaseIntegrity: integrity,
      backupCount: backupService.listBackups().length
    });
  });

  app.get('/api/metrics', (req: Request, res: Response) => {
    res.json(observability.getSnapshot());
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Centralized Error Handling Middleware (prevents leaking stack traces or internal SQL exceptions)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(`[SERVER_ERROR] ${req.method} ${req.originalUrl}:`, err);

    if (res.headersSent) {
      return next(err);
    }

    const statusCode = err.status || err.statusCode || 500;
    const safeMessage = statusCode === 500 
      ? 'An unexpected internal error occurred. Please try again later.' 
      : (err.message || 'Request failed');

    res.status(statusCode).json({
      error: safeMessage,
      code: err.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    });
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StudyFlow server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
