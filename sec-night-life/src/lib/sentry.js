/**
 * Optional Sentry — initializes only when VITE_SENTRY_DSN is set.
 */
import * as Sentry from '@sentry/react';

const dsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();

export function initSentry() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,
  });
}

export { Sentry };
