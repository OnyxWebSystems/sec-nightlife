-- Venue seating/floor plans for day bookings and events.

ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "show_seating_plan_for_day_bookings" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "venue_seating_plans" (
  "id" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "caption" TEXT,
  "image_url" TEXT NOT NULL,
  "image_public_id" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "zones" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venue_seating_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "venue_seating_plans_venue_id_idx" ON "venue_seating_plans"("venue_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_seating_plans_venue_id_fkey'
  ) THEN
    ALTER TABLE "venue_seating_plans"
      ADD CONSTRAINT "venue_seating_plans_venue_id_fkey"
      FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "show_seating_plan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "seating_plan_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_seating_plan_id_fkey'
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_seating_plan_id_fkey"
      FOREIGN KEY ("seating_plan_id") REFERENCES "venue_seating_plans"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
