-- CreateTable
CREATE TABLE "venue_follows" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_follows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_follows_user_id_venue_id_key" ON "venue_follows"("user_id", "venue_id");
CREATE INDEX "venue_follows_user_id_idx" ON "venue_follows"("user_id");
CREATE INDEX "venue_follows_venue_id_idx" ON "venue_follows"("venue_id");

ALTER TABLE "venue_follows" ADD CONSTRAINT "venue_follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_follows" ADD CONSTRAINT "venue_follows_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy user_profiles.followed_venues (only where venue still exists)
INSERT INTO "venue_follows" ("id", "user_id", "venue_id", "created_at")
SELECT
  gen_random_uuid()::text,
  up."user_id",
  v."id",
  CURRENT_TIMESTAMP
FROM "user_profiles" up
CROSS JOIN LATERAL unnest(COALESCE(up."followed_venues", ARRAY[]::text[])) AS vid(venue_id)
INNER JOIN "venues" v ON v."id" = vid.venue_id AND v."deleted_at" IS NULL
ON CONFLICT ("user_id", "venue_id") DO NOTHING;
