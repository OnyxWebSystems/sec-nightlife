-- Day listing weekly schedule (replaces one-off service dates for recurring availability)
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "service_schedule" JSONB;
