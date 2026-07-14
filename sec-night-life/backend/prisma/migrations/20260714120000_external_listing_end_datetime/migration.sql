-- End date/time for user-listed external tables/events (QR + Past visibility).
ALTER TABLE "hosted_tables" ADD COLUMN IF NOT EXISTS "event_end_date" TIMESTAMP(3);
ALTER TABLE "hosted_tables" ADD COLUMN IF NOT EXISTS "event_end_time" TEXT;

-- Backfill end fields for own-place listings that lack an end schedule.
UPDATE "hosted_tables"
SET
  "event_end_date" = "event_date",
  "event_end_time" = COALESCE("event_end_time", '23:59')
WHERE "table_type" = 'EXTERNAL_VENUE'
  AND "venue_table_id" IS NULL
  AND "event_end_date" IS NULL;

-- Derive window_ends_at from end date + end time in SAST when missing.
UPDATE "hosted_tables"
SET "window_ends_at" = (
  (COALESCE("event_end_date", "event_date")::date + COALESCE("event_end_time", '23:59')::time)
  AT TIME ZONE 'Africa/Johannesburg'
)
WHERE "table_type" = 'EXTERNAL_VENUE'
  AND "venue_table_id" IS NULL
  AND "window_ends_at" IS NULL
  AND "event_date" IS NOT NULL;
