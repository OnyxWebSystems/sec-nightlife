/**
 * One-shot: apply job soft-delete + RELEASED enum to the connected database.
 * Run from backend/:  node scripts/apply-job-soft-delete.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MIGRATION_NAME = '20260710120000_job_soft_delete_and_released';

async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3)`,
  );
  console.log('OK: deleted_at column');

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "job_postings_deleted_at_idx" ON "job_postings"("deleted_at")`,
  );
  console.log('OK: deleted_at index');

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ApplicationStatus' AND e.enumlabel = 'RELEASED'
  ) THEN
    ALTER TYPE "ApplicationStatus" ADD VALUE 'RELEASED';
  END IF;
END $$;
`);
  console.log('OK: RELEASED enum');

  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
    MIGRATION_NAME,
  );
  if (!rows.length) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        gen_random_uuid()::text,
        'manual-apply-job-soft-delete',
        NOW(),
        '${MIGRATION_NAME}',
        NULL,
        NULL,
        NOW(),
        1
      )
    `);
    console.log('OK: migration recorded in _prisma_migrations');
  } else {
    console.log('OK: migration already recorded');
  }

  const col = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'job_postings' AND column_name = 'deleted_at'
  `);
  const enumVal = await prisma.$queryRawUnsafe(`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ApplicationStatus' AND e.enumlabel = 'RELEASED'
  `);
  console.log('VERIFY deleted_at:', col);
  console.log('VERIFY RELEASED:', enumVal);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
