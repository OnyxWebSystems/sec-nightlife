import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

if (hasDatabaseUrl) {
  console.log('[build] DATABASE_URL detected: running prisma migrate deploy + prisma generate');
  run('npx', ['prisma', 'migrate', 'deploy']);
  run('npx', ['prisma', 'generate']);
} else {
  console.log('[build] DATABASE_URL not set: skipping prisma migrate deploy, running prisma generate only');
  run('npx', ['prisma', 'generate']);
}
