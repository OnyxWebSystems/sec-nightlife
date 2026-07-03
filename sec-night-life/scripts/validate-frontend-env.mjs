#!/usr/bin/env node
/**
 * Validates production frontend env before Vite build on Vercel.
 * Skipped for local dev unless FORCE_PRODUCTION_ENV_CHECK=1.
 */
const isProdBuild =
  process.env.VERCEL_ENV === 'production' || process.env.FORCE_PRODUCTION_ENV_CHECK === '1';

if (!isProdBuild) {
  process.exit(0);
}

const required = ['VITE_API_URL', 'VITE_PUBLIC_APP_URL'];
const errors = [];

for (const key of required) {
  const value = process.env[key]?.trim();
  if (!value) {
    errors.push(`${key} is missing`);
    continue;
  }
  if (/localhost|127\.0\.0\.1/.test(value)) {
    errors.push(`${key} must not point to localhost in production (got ${value})`);
  }
  if (!value.startsWith('https://')) {
    errors.push(`${key} must use HTTPS in production (got ${value})`);
  }
}

const apiUrl = process.env.VITE_API_URL?.trim() || '';
if (apiUrl && !apiUrl.includes('api.')) {
  console.warn('[validate-frontend-env] WARN: VITE_API_URL does not look like an API subdomain.');
}

if (errors.length > 0) {
  console.error('\n[validate-frontend-env] Production build blocked:\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nSet variables in Vercel → sec-night-life → Settings → Environment Variables (Production).\n');
  process.exit(1);
}

console.log('[validate-frontend-env] Production frontend env OK');
