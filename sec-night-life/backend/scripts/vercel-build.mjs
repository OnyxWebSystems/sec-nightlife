import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isRetryableMigrateLockError(output) {
  return output.includes('P1002') && output.includes('pg_advisory_lock');
}

function deriveDirectNeonUrl(databaseUrl) {
  if (!databaseUrl || !databaseUrl.includes('-pooler.')) return null;
  try {
    const u = new URL(databaseUrl);
    u.hostname = u.hostname.replace('-pooler.', '.');
    return u.toString();
  } catch {
    return null;
  }
}

function runPrismaMigrateDeployWithRetry({
  maxAttempts = 4,
  migrateDatabaseUrl,
} = {}) {
  const migrateEnv = {
    ...process.env,
    ...(migrateDatabaseUrl ? { DATABASE_URL: migrateDatabaseUrl } : {}),
    // Prefer IPv4 in CI to reduce intermittent DNS/network issues.
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first'].filter(Boolean).join(' '),
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'pipe',
      encoding: 'utf8',
      shell: process.platform === 'win32',
      env: migrateEnv,
    });
    const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.status === 0) return;

    const retryable = isRetryableMigrateLockError(combinedOutput);
    if (!retryable || attempt === maxAttempts) {
      process.exit(result.status ?? 1);
    }

    const waitMs = attempt * 5000;
    console.warn(
      `[build] prisma migrate deploy hit advisory lock timeout (attempt ${attempt}/${maxAttempts}). ` +
      `Retrying in ${waitMs / 1000}s...`
    );
    sleep(waitMs);
  }
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

if (hasDatabaseUrl) {
  console.log('[build] DATABASE_URL detected: running prisma migrate deploy + prisma generate');
  const directFromEnv = process.env.DIRECT_DATABASE_URL?.trim();
  const derivedDirect = deriveDirectNeonUrl(process.env.DATABASE_URL?.trim());
  const migrateDatabaseUrl = directFromEnv || derivedDirect || process.env.DATABASE_URL;
  if (directFromEnv) {
    console.log('[build] Using DIRECT_DATABASE_URL for prisma migrate deploy');
  } else if (derivedDirect) {
    console.log('[build] Using derived direct Neon URL for prisma migrate deploy (pooler avoided)');
  } else {
    console.log('[build] Using DATABASE_URL for prisma migrate deploy');
  }
  runPrismaMigrateDeployWithRetry({ migrateDatabaseUrl });
  run('npx', ['prisma', 'generate']);
} else {
  console.log('[build] DATABASE_URL not set: skipping prisma migrate deploy, running prisma generate only');
  run('npx', ['prisma', 'generate']);
}
