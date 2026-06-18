-- Allow event table guest bookings on direct venue slots (no hosted table row yet).
ALTER TABLE "event_venue_table_bookings" ALTER COLUMN "hosted_table_id" DROP NOT NULL;
ALTER TABLE "event_venue_table_bookings" ADD COLUMN IF NOT EXISTS "venue_table_id" TEXT;
ALTER TABLE "event_venue_table_bookings" ADD COLUMN IF NOT EXISTS "table_session_number" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "event_venue_table_bookings_venue_table_id_idx"
  ON "event_venue_table_bookings"("venue_table_id");

DO $$ BEGIN
  ALTER TABLE "event_venue_table_bookings"
    ADD CONSTRAINT "event_venue_table_bookings_venue_table_id_fkey"
    FOREIGN KEY ("venue_table_id") REFERENCES "venue_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
