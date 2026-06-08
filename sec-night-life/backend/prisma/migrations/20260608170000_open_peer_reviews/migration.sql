-- Open peer reviews: one review per user pair; venue-attributed user reviews

-- Dedupe user_reviews on (reviewer_id, subject_user_id); keep newest updated_at
DELETE FROM "user_reviews" a
USING "user_reviews" b
WHERE a."reviewer_id" = b."reviewer_id"
  AND a."subject_user_id" = b."subject_user_id"
  AND a."updated_at" < b."updated_at";

DROP INDEX IF EXISTS "user_reviews_reviewer_id_subject_user_id_event_id_key";

ALTER TABLE "user_reviews" ALTER COLUMN "event_id" DROP NOT NULL;

CREATE UNIQUE INDEX "user_reviews_reviewer_id_subject_user_id_key"
  ON "user_reviews"("reviewer_id", "subject_user_id");

CREATE TABLE "venue_user_reviews" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "subject_user_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" TEXT,
    "flagged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_user_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_user_reviews_venue_id_subject_user_id_key"
  ON "venue_user_reviews"("venue_id", "subject_user_id");
CREATE INDEX "venue_user_reviews_subject_user_id_idx" ON "venue_user_reviews"("subject_user_id");
CREATE INDEX "venue_user_reviews_author_user_id_idx" ON "venue_user_reviews"("author_user_id");
CREATE INDEX "venue_user_reviews_flagged_idx" ON "venue_user_reviews"("flagged");

ALTER TABLE "venue_user_reviews" ADD CONSTRAINT "venue_user_reviews_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_user_reviews" ADD CONSTRAINT "venue_user_reviews_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_user_reviews" ADD CONSTRAINT "venue_user_reviews_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
