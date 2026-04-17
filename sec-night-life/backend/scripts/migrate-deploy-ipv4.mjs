/**
 * Runs `prisma migrate deploy` with Node IPv4-first DNS (often fixes Neon P1001 on Windows).
 * Usage: node scripts/migrate-deploy-ipv4.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first'].filter(Boolean).join(' '),
};

const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
  env,
  cwd: backendRoot,
});

process.exit(r.status ?? 1);
