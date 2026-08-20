#!/usr/bin/env node
/**
 * Production Capacitor build: force non-localhost API URLs, then vite build + cap sync.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(root, '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const apiUrl = (process.env.VITE_API_URL || '').trim() || 'https://api.secnightlife.com';
const appUrl = (process.env.VITE_PUBLIC_APP_URL || '').trim() || 'https://secnightlife.com';

if (/localhost|127\.0\.0\.1/i.test(apiUrl) || /localhost|127\.0\.0\.1/i.test(appUrl)) {
  console.error('[build-mobile] Refusing mobile build with localhost VITE_* URLs.');
  console.error(`  VITE_API_URL=${apiUrl}`);
  console.error(`  VITE_PUBLIC_APP_URL=${appUrl}`);
  process.exit(1);
}

if (!apiUrl.startsWith('https://') || !appUrl.startsWith('https://')) {
  console.error('[build-mobile] Mobile builds require HTTPS VITE_API_URL and VITE_PUBLIC_APP_URL.');
  process.exit(1);
}

process.env.VITE_API_URL = apiUrl;
process.env.VITE_PUBLIC_APP_URL = appUrl;
process.env.FORCE_PRODUCTION_ENV_CHECK = '1';

console.log(`[build-mobile] VITE_API_URL=${apiUrl}`);
console.log(`[build-mobile] VITE_PUBLIC_APP_URL=${appUrl}`);

run('node', ['scripts/validate-frontend-env.mjs']);
run('npx', ['vite', 'build']);
run('node', ['scripts/sync-ios-app-icon.mjs']);
run('npx', ['cap', 'sync']);

console.log('[build-mobile] Done.');
