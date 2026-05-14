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

/** Neon cold start / transient network from Vercel build regions often surfaces as P1001. */
function isRetryableConnectionError(output) {
  return (
    output.includes('P1001') &&
    (output.includes("Can't reach database server") || output.includes("Can't reach database"))
  );
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

function normalizeDbUrl(raw, varName) {
  if (!raw || typeof raw !== 'string') return null;
  let v = raw.trim();
  if (!v) return null;
  // Allow accidentally pasted "KEY=value" secrets from dashboards.
  const keyPrefix = `${varName}=`;
  if (v.startsWith(keyPrefix)) v = v.slice(keyPrefix.length).trim();
  // Remove optional matching quotes.
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v || null;
}

function isPostgresUrl(url) {
  return typeof url === 'string' && (url.startsWith('postgresql://') || url.startsWith('postgres://'));
}

function runPrismaMigrateDeployWithRetry({
  maxAttempts = 4,
  migrateDatabaseUrl,
  allowLockTimeoutSkip = false,
} = {}) {
  const connectionMaxAttempts = Math.max(
    maxAttempts,
    parseInt(process.env.PRISMA_MIGRATE_P1001_MAX_ATTEMPTS || '6', 10) || 6
  );
  const migrateEnv = {
    ...process.env,
    ...(migrateDatabaseUrl ? { DATABASE_URL: migrateDatabaseUrl } : {}),
    // Prefer IPv4 in CI to reduce intermittent DNS issues; set PRISMA_MIGRATE_DNS_IPV4FIRST=0 to omit.
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      process.env.PRISMA_MIGRATE_DNS_IPV4FIRST === '0' ? '' : '--dns-result-order=ipv4first',
    ]
      .filter(Boolean)
      .join(' '),
  };
  for (let attempt = 1; attempt <= connectionMaxAttempts; attempt += 1) {
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

    const lockRetryable = isRetryableMigrateLockError(combinedOutput);
    const connRetryable = isRetryableConnectionError(combinedOutput);
    const retryable = lockRetryable || connRetryable;

    if (!retryable) {
      if (combinedOutput.includes('P1001')) {
        console.error(
          '\n[build] Prisma P1001: database unreachable during migrate. Check:\n' +
          '  - Neon project is active (not deleted); branch/compute wakes on connect.\n' +
          '  - DIRECT_DATABASE_URL uses the host from Neon “Connection string” (direct), with ?sslmode=require.\n' +
          '  - Neon IP allowlist: allow all, or include Vercel build egress (often easier to disable allowlist for serverless DBs).\n' +
          '  - Retry: set PRISMA_MIGRATE_P1001_MAX_ATTEMPTS=8 if cold starts are slow.\n'
        );
      }
      process.exit(result.status ?? 1);
    }
    if (attempt === connectionMaxAttempts) {
      if (allowLockTimeoutSkip && lockRetryable) {
        console.warn(
          '[build] prisma migrate deploy exhausted retries due to advisory lock timeout. ' +
          'Continuing build because lock-timeout skip is enabled.'
        );
        return;
      }
      process.exit(result.status ?? 1);
    }

    const waitMs = lockRetryable ? attempt * 5000 : Math.min(20_000, 3000 + attempt * 2500);
    const reason = lockRetryable ? 'advisory lock timeout' : 'database unreachable (P1001)';
    console.warn(
      `[build] prisma migrate deploy: ${reason} (attempt ${attempt}/${connectionMaxAttempts}). ` +
      `Retrying in ${waitMs / 1000}s...`
    );
    sleep(waitMs);
  }
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());

if (hasDatabaseUrl) {
  console.log('[build] DATABASE_URL detected: running prisma migrate deploy + prisma generate');
  const normalizedDatabaseUrl = normalizeDbUrl(process.env.DATABASE_URL, 'DATABASE_URL');
  const normalizedDirectUrl = normalizeDbUrl(process.env.DIRECT_DATABASE_URL, 'DIRECT_DATABASE_URL');
  const derivedDirect = deriveDirectNeonUrl(normalizedDatabaseUrl);
  const migrateDatabaseUrl = normalizedDirectUrl || derivedDirect || normalizedDatabaseUrl;
  if (!isPostgresUrl(migrateDatabaseUrl)) {
    console.error(
      '[build] Invalid database URL format. DATABASE_URL / DIRECT_DATABASE_URL must start with postgres:// or postgresql://'
    );
    process.exit(1);
  }
  if (normalizedDirectUrl) {
    console.log('[build] Using DIRECT_DATABASE_URL for prisma migrate deploy');
  } else if (derivedDirect) {
    console.log('[build] Using derived direct Neon URL for prisma migrate deploy (pooler avoided)');
  } else {
    console.log('[build] Using DATABASE_URL for prisma migrate deploy');
  }
  const allowLockTimeoutSkip = process.env.PRISMA_MIGRATE_ALLOW_LOCK_TIMEOUT_SKIP !== '0';
  runPrismaMigrateDeployWithRetry({ migrateDatabaseUrl, allowLockTimeoutSkip });
  run('npx', ['prisma', 'generate']);
} else {
  console.log('[build] DATABASE_URL not set: skipping prisma migrate deploy, running prisma generate only');
  run('npx', ['prisma', 'generate']);
}
