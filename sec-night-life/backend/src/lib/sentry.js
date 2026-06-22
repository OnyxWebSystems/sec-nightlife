/**
 * Optional Sentry — initializes only when SENTRY_DSN is set.
 */
import * as Sentry from '@sentry/node';

const dsn = String(process.env.SENTRY_DSN || '').trim();

export function initSentry() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}

export { Sentry };
