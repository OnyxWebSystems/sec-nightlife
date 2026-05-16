-- Venue-level default fees for custom tables and host listings (day bookings)
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "host_table_fee_zar" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "custom_table_booking_fee_zar" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Per-tier host table fee on venue-controlled listings
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "host_table_fee_zar" DOUBLE PRECISION NOT NULL DEFAULT 0;
