-- AlterTable
ALTER TABLE "venue_staff_assignments" ADD COLUMN "access_token" TEXT;

UPDATE "venue_staff_assignments" SET "access_token" = md5(random()::text || clock_timestamp()::text || id) WHERE "access_token" IS NULL;

ALTER TABLE "venue_staff_assignments" ALTER COLUMN "access_token" SET NOT NULL;

CREATE UNIQUE INDEX "venue_staff_assignments_access_token_key" ON "venue_staff_assignments"("access_token");
