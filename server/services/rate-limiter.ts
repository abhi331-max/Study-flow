import { Request, Response, NextFunction } from 'express';
import { securityLogger } from './security-logger.js';

interface RateLimitRecord {
  timestamps: number[];
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
  isSecurityCritical?: boolean;
}) {
  const ipMap = new Map<string, RateLimitRecord>();

  // Cleanup old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipMap.entries()) {
      record.timestamps = record.timestamps.filter(t => now - t < options.windowMs);
      if (record.timestamps.length === 0) {
        ipMap.delete(ip);
      }
    }
  }, 5 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction) => {
    let rawIp: string = req.ip || '';
    if (!rawIp && req.headers['x-forwarded-for']) {
      const forwarded = req.headers['x-forwarded-for'];
      rawIp = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
    }
    if (!rawIp) {
      rawIp = req.socket.remoteAddress || 'unknown';
    }

    const clientKey = String(rawIp).trim().toLowerCase();
    const now = Date.now();

    let record = ipMap.get(clientKey);
    if (!record) {
      record = { timestamps: [] };
      ipMap.set(clientKey, record);
    }

    // Filter out timestamps outside window
    record.timestamps = record.timestamps.filter(t => now - t < options.windowMs);

    if (record.timestamps.length >= options.maxRequests) {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', retryAfter);

      if (options.isSecurityCritical) {
        securityLogger.log({
          type: 'RATE_LIMIT_EXCEEDED',
          ip: clientKey,
          details: `Hit rate limit on ${req.method} ${req.path} (${record.timestamps.length}/${options.maxRequests} reqs)`
        });
      }

      res.status(429).json({
        error: options.message || 'Too many requests, please slow down.',
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    record.timestamps.push(now);
    next();
  };
}

export const generalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  message: 'General API rate limit exceeded. Please try again in a few seconds.',
});

export const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 25,
  message: 'Too many authentication attempts. Please wait 60 seconds.',
  isSecurityCritical: true,
});

export const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  maxRequests: 5,
  message: 'Too many password reset attempts. Please wait 15 minutes before trying again.',
  isSecurityCritical: true,
});

export const heavyOperationLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 40,
  message: 'Rate limit exceeded for heavy operations. Please wait a moment.',
});
