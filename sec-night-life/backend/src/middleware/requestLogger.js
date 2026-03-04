/**
 * Request logger middleware.
 * SECURITY: Never logs Authorization headers, cookies, or request bodies.
 * Never log sensitive credentials.
 */
import { logger } from '../lib/logger.js';

const isProd = process.env.NODE_ENV === 'production';

export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const meta = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: duration,
      // SECURITY: never log Authorization header or cookies
      ip: req.ip || req.socket?.remoteAddress
    };

    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.path} ${res.statusCode}`, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.path} ${res.statusCode}`, meta);
    } else if (!isProd) {
      // In production, skip successful request logs to reduce noise
      logger.info(`${req.method} ${req.path} ${res.statusCode}`, meta);
    }
  });
  next();
}
