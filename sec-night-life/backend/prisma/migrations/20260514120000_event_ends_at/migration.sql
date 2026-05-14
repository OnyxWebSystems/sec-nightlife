-- AlterTable
ALTER TABLE "events" ADD COLUMN "ends_at" TIMESTAMP(3);

UPDATE "events"
SET "ends_at" = "date" + interval '24 hours'
WHERE "ends_at" IS NULL;

CREATE INDEX "events_ends_at_idx" ON "events"("ends_at");
