-- User profile audit fields for promoter verification lifecycle
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "promoter_verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promoter_verified_by" TEXT,
  ADD COLUMN IF NOT EXISTS "promoter_revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promoter_revoked_by" TEXT,
  ADD COLUMN IF NOT EXISTS "promoter_verification_note" TEXT;

-- Completion signal for job posting applications
ALTER TABLE "job_applications"
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

-- Promoter follow graph
CREATE TABLE IF NOT EXISTS "promoter_follows" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "promoter_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promoter_follows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promoter_follows_user_id_promoter_id_key"
  ON "promoter_follows"("user_id", "promoter_id");
CREATE INDEX IF NOT EXISTS "promoter_follows_user_id_idx"
  ON "promoter_follows"("user_id");
CREATE INDEX IF NOT EXISTS "promoter_follows_promoter_id_idx"
  ON "promoter_follows"("promoter_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promoter_follows_user_id_fkey'
  ) THEN
    ALTER TABLE "promoter_follows"
      ADD CONSTRAINT "promoter_follows_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promoter_follows_promoter_id_fkey'
  ) THEN
    ALTER TABLE "promoter_follows"
      ADD CONSTRAINT "promoter_follows_promoter_id_fkey"
      FOREIGN KEY ("promoter_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- DB-level dedupe for ratings by context
CREATE UNIQUE INDEX IF NOT EXISTS "service_ratings_rater_user_id_ratee_user_id_context_type_context_id_key"
  ON "service_ratings"("rater_user_id", "ratee_user_id", "context_type", "context_id");
