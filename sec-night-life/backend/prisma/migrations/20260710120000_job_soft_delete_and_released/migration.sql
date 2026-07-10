-- Soft-delete for job postings + RELEASED application status for unhire
ALTER TABLE "job_postings" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "job_postings_deleted_at_idx" ON "job_postings"("deleted_at");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ApplicationStatus' AND e.enumlabel = 'RELEASED'
  ) THEN
    ALTER TYPE "ApplicationStatus" ADD VALUE 'RELEASED';
  END IF;
END $$;
