import { logger } from '../lib/logger.js';

const isProd = process.env.NODE_ENV === 'production';

export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  // STEP 3/4: Never expose stack traces in production; never log sensitive fields
  if (isProd) {
    // Only log 5xx errors in production — 4xx are client errors, not our fault
    if (status >= 500) {
      logger.error('Internal server error', {
        status,
        method: req.method,
        path: req.path,
        message: err.message
        // SECURITY: no stack, no body, no headers
      });
    }
    return res.status(status).json({ error: 'Internal server error' });
  }

  // Development: log full error for debugging
  logger.error(err.message, { status, stack: err.stack });

  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(err.code && { code: err.code })
  });
}
