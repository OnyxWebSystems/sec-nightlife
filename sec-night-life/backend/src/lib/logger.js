/**
 * Structured logger.
 * Never log sensitive credentials — passwords, tokens, secrets, authorization headers.
 *
 * All log output is JSON in production for log aggregation tools.
 * In development, output is human-readable.
 */

const isProd = process.env.NODE_ENV === 'production';

// SECURITY: keys that must never appear in logs
const REDACTED_KEYS = new Set([
  'password', 'passwordHash', 'password_hash',
  'token', 'refreshToken', 'accessToken', 'refresh_token', 'access_token',
  'secret', 'resetToken', 'reset_token', 'verificationToken', 'verification_token',
  'authorization', 'cookie', 'set-cookie',
  'DATABASE_URL', 'SMTP_PASS', 'CLOUDINARY_API_SECRET'
]);

export function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACTED_KEYS.has(k) || REDACTED_KEYS.has(k.toLowerCase())
      ? '[REDACTED]'
      : (typeof v === 'object' ? redact(v) : v);
  }
  return out;
}

function write(level, message, meta = {}) {
  const safe = redact(meta);
  if (isProd) {
    process.stdout.write(JSON.stringify({ level, ts: new Date().toISOString(), message, ...safe }) + '\n');
  } else {
    const prefix = { info: 'ℹ', warn: '⚠', error: '✖', debug: '·' }[level] || level;
    const metaStr = Object.keys(safe).length ? ' ' + JSON.stringify(safe) : '';
    process.stdout.write(`${prefix} ${message}${metaStr}\n`);
  }
}

export const logger = {
  info:  (msg, meta = {}) => write('info',  msg, meta),
  warn:  (msg, meta = {}) => write('warn',  msg, meta),
  error: (msg, meta = {}) => write('error', msg, meta),
  debug: (msg, meta = {}) => { if (!isProd) write('debug', msg, meta); }
};
