-- Day-booking time windows: link hosted sessions to venue slots and persist guest windows.

ALTER TABLE "hosted_tables" ADD COLUMN IF NOT EXISTS "venue_table_id" TEXT;
ALTER TABLE "hosted_tables" ADD COLUMN IF NOT EXISTS "window_ends_at" TIMESTAMP(3);

ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "booking_date" DATE;
ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "window_start_time" TEXT;
ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "window_end_time" TEXT;

CREATE INDEX IF NOT EXISTS "hosted_tables_venue_table_id_idx" ON "hosted_tables"("venue_table_id");
CREATE INDEX IF NOT EXISTS "hosted_tables_window_ends_at_idx" ON "hosted_tables"("window_ends_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hosted_tables_venue_table_id_fkey'
  ) THEN
    ALTER TABLE "hosted_tables"
      ADD CONSTRAINT "hosted_tables_venue_table_id_fkey"
      FOREIGN KEY ("venue_table_id") REFERENCES "venue_tables"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill venue_table_id from venue_tables.hosted_table_id for existing day sessions.
UPDATE "hosted_tables" ht
SET "venue_table_id" = vt.id
FROM "venue_tables" vt
WHERE vt."hosted_table_id" = ht.id
  AND ht."venue_table_id" IS NULL
  AND vt."event_id" IS NULL
  AND vt."hosting_tier_key" LIKE 'day:%';
