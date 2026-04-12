-- Reviews & ratings: NotificationType, user_reviews, venue_reviews reshape

ALTER TYPE "NotificationType" ADD VALUE 'USER_REVIEW_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_FLAGGED_USER_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_FLAGGED_VENUE_REVIEW';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_REMOVED_BY_ADMIN';

-- Dedupe legacy venue_reviews on (user_id, venue_id); keep newest row
DELETE FROM "venue_reviews" a
USING "venue_reviews" b
WHERE a."user_id" = b."user_id"
  AND a."venue_id" = b."venue_id"
  AND a."created_at" < b."created_at";

ALTER TABLE "venue_reviews" ADD COLUMN IF NOT EXISTS "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "venue_reviews" ADD COLUMN IF NOT EXISTS "flag_reason" TEXT;
ALTER TABLE "venue_reviews" ADD COLUMN IF NOT EXISTS "flagged_at" TIMESTAMP(3);
ALTER TABLE "venue_reviews" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "venue_reviews" SET "comment" = COALESCE("comment", '');
ALTER TABLE "venue_reviews" ALTER COLUMN "comment" SET NOT NULL;

ALTER TABLE "venue_reviews" DROP COLUMN IF EXISTS "event_id";
ALTER TABLE "venue_reviews" DROP COLUMN IF EXISTS "metadata";

CREATE UNIQUE INDEX IF NOT EXISTS "venue_reviews_user_id_venue_id_key" ON "venue_reviews"("user_id", "venue_id");
CREATE INDEX IF NOT EXISTS "venue_reviews_flagged_idx" ON "venue_reviews"("flagged");

DO $$
BEGIN
  ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "user_reviews" (
    "id" TEXT NOT NULL,
    "reviewer_id" TEXT NOT NULL,
    "subject_user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "table_id" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" TEXT,
    "flagged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_reviews_reviewer_id_subject_user_id_event_id_key" ON "user_reviews"("reviewer_id", "subject_user_id", "event_id");
CREATE INDEX IF NOT EXISTS "user_reviews_subject_user_id_idx" ON "user_reviews"("subject_user_id");
CREATE INDEX IF NOT EXISTS "user_reviews_reviewer_id_idx" ON "user_reviews"("reviewer_id");
CREATE INDEX IF NOT EXISTS "user_reviews_flagged_idx" ON "user_reviews"("flagged");

DO $$
BEGIN
  ALTER TABLE "user_reviews" ADD CONSTRAINT "user_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "user_reviews" ADD CONSTRAINT "user_reviews_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "user_reviews" ADD CONSTRAINT "user_reviews_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "user_reviews" ADD CONSTRAINT "user_reviews_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
