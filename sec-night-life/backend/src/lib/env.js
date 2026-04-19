/**
 * Environment validation — runs at startup before any other module loads.
 * Fatal errors cause immediate process.exit(1) with a clear message.
 *
 * Rules:
 *  - Required vars must be present and non-empty in ALL environments.
 *  - JWT secrets must be ≥ 32 chars and must NOT contain placeholder text.
 *  - In production: CORS_ORIGIN and APP_URL must be set.
 *  - In production: Resend email provider must be configured.
 *  - No wildcard CORS origins in production.
 *  - No localhost in CORS_ORIGIN in production.
 *  - Scheduled jobs: set CRON_SECRET in Vercel (same value as in Project Settings). Vercel Cron
 *    invokes /api/cron/* with Authorization: Bearer <CRON_SECRET>. Interest reminders need
 *    APP_URL for email links and DB migrations for interested_events + event_interest_reminders_sent.
 *
 * NEVER allow placeholder secrets in production.
 */

// Every pattern here causes a fatal error if found in a secret value
const PLACEHOLDER_PATTERNS = [
  /REPLACE/i,                     // catches REPLACE_WITH_REAL_SECRET...
  /your[-_]?super[-_]?secret/i,
  /change[-_]?in[-_]?prod/i,
  /dev[-_]?secret/i,
  /replace[-_]?me/i,
  /todo/i,
  /example/i,
  /placeholder/i,
  /insert[-_]?secret/i,
  /my[-_]?secret/i,
  /secret[-_]?here/i,
  /changeme/i,
  /password123/i,
  /abc123/i
];

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some(re => re.test(value));
}

function fatal(msg) {
  // Use process.stderr directly — logger module may not be loaded yet
  process.stderr.write(`\n[FATAL STARTUP ERROR] ${msg}\n\n`);
  process.exit(1);
}

function warn(msg) {
  process.stderr.write(`[WARN] ${msg}\n`);
}

export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';

  // ── 1. Required in ALL environments ──────────────────────────────────────
  const alwaysRequired = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of alwaysRequired) {
    const val = process.env[key];
    if (!val || val.trim() === '') {
      fatal(
        `Missing required environment variable: ${key}\n` +
        `  Set it in your .env file or deployment environment.`
      );
    }
  }

  // ── 2. JWT secrets must be strong and non-placeholder ────────────────────
  const jwtSecrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  for (const key of jwtSecrets) {
    const val = process.env[key];

    if (isPlaceholder(val)) {
      fatal(
        `${key} contains a placeholder or insecure value: "${val.slice(0, 20)}..."\n` +
        `  Generate a real secret:\n` +
        `  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"\n` +
        `  Then set it in your .env file.`
      );
    }

    if (val.length < 32) {
      fatal(
        `${key} is too short (${val.length} chars, minimum 32).\n` +
        `  Use a strong random secret of at least 32 characters.`
      );
    }
  }

  // ── 3. JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different ─────────
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    fatal(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.\n' +
      '  Using the same secret for both is a security vulnerability.'
    );
  }

  // ── 4. NODE_ENV ───────────────────────────────────────────────────────────
  if (!process.env.NODE_ENV) {
    warn('NODE_ENV is not set. Defaulting to development. Set NODE_ENV=production for deployment.');
  }

  // ── 5. Production-only requirements ──────────────────────────────────────
  if (isProd) {
    // CORS_ORIGIN required in production
    const corsOrigin = process.env.CORS_ORIGIN;
    if (!corsOrigin || corsOrigin.trim() === '') {
      fatal(
        'CORS_ORIGIN must be set in production.\n' +
        '  Example: CORS_ORIGIN=https://yourdomain.com'
      );
    }
    if (corsOrigin.includes('localhost') || corsOrigin.includes('127.0.0.1')) {
      fatal(
        'CORS_ORIGIN must not contain localhost or 127.0.0.1 in production.\n' +
        `  Current value: ${corsOrigin}`
      );
    }
    if (corsOrigin.includes('*')) {
      fatal('CORS_ORIGIN must not use wildcards (*) in production.');
    }

    // Email provider required in production — Resend only
    const hasResend = !!process.env.RESEND_API_KEY;

    if (!hasResend) {
      fatal(
        'Email provider is not configured for production.\n' +
        '  Configure Resend (RESEND_API_KEY).\n' +
        '  This is required so users can receive verification and reset emails.'
      );
    }

    if (hasResend && !process.env.EMAIL_FROM) {
      fatal(
        'EMAIL_FROM must be set when using Resend in production.\n' +
        '  Example: EMAIL_FROM="SEC Nightlife <noreply@secnightlife.com>".'
      );
    }

    // APP_URL required in production — used in verification email links
    const appUrl = process.env.APP_URL;
    if (!appUrl || appUrl.trim() === '') {
      fatal(
        'APP_URL must be set in production.\n' +
        '  Example: APP_URL=https://yourdomain.com\n' +
        '  This is used in email verification links.'
      );
    }
    if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
      fatal(
        'APP_URL must not contain localhost in production.\n' +
        `  Current value: ${appUrl}`
      );
    }
    if (!appUrl.startsWith('https://')) {
      fatal(
        'APP_URL must use HTTPS in production.\n' +
        `  Current value: ${appUrl}`
      );
    }

    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.trim() === '') {
      warn(
        'CRON_SECRET is not set. Vercel Cron jobs that call /api/cron/* will receive 401 until ' +
        'CRON_SECRET is set to the same value configured in the Vercel project (Bearer token). ' +
        'Event interest reminders (T-3h) and other cron tasks will not run.'
      );
    }
  }
}
