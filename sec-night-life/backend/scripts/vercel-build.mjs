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

function runPrismaMigrateDeployWithRetry(maxAttempts = 4) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'pipe',
      encoding: 'utf8',
      shell: process.platform === 'win32'
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
  runPrismaMigrateDeployWithRetry();
  run('npx', ['prisma', 'generate']);
} else {
  console.log('[build] DATABASE_URL not set: skipping prisma migrate deploy, running prisma generate only');
  run('npx', ['prisma', 'generate']);
}
