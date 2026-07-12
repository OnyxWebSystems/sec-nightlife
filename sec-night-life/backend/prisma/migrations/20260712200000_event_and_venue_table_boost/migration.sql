-- Event paid feed boost
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "boosted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "boosted_at" TIMESTAMP(3);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "boost_expires_at" TIMESTAMP(3);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "boost_paystack_ref" TEXT;
CREATE INDEX IF NOT EXISTS "events_boosted_boost_expires_at_idx" ON "events"("boosted", "boost_expires_at");

-- Venue table (day booking) paid feed boost
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "boosted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "boosted_at" TIMESTAMP(3);
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "boost_expires_at" TIMESTAMP(3);
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "boost_paystack_ref" TEXT;
CREATE INDEX IF NOT EXISTS "venue_tables_boosted_boost_expires_at_idx" ON "venue_tables"("boosted", "boost_expires_at");
