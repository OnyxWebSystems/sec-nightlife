-- Founder vision: booking economics, venue reservations, celebrations

CREATE TYPE "MinSpendSettlement" AS ENUM ('PREPAY_MENU', 'PREPAY_LUMP', 'PAY_ON_ARRIVAL');

ALTER TYPE "VenueTableMemberStatus" ADD VALUE IF NOT EXISTS 'PENDING_VENUE_REVIEW';
ALTER TYPE "VenueTableMemberStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "VenueTableMemberStatus" ADD VALUE IF NOT EXISTS 'DECLINED';

ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "accepts_day_bookings" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "booking_policies" JSONB;
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "external_booking_links" JSONB;

ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "booking_fee_zar" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "min_spend_settlement" "MinSpendSettlement" NOT NULL DEFAULT 'PAY_ON_ARRIVAL';
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "service_date" TIMESTAMP(3);
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "start_time" TEXT;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "end_time" TEXT;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "party_size" INTEGER;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "is_custom_listing" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "allows_custom_requests" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "tier_label" TEXT;

ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "user_specs" JSONB;
ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "decline_reason" TEXT;
ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);
ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" TEXT;
ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "settlement_mode" "MinSpendSettlement";

ALTER TABLE "event_venue_table_bookings" ADD COLUMN IF NOT EXISTS "booking_fee_zar" DOUBLE PRECISION;
ALTER TABLE "event_venue_table_bookings" ADD COLUMN IF NOT EXISTS "minimum_spend_zar" DOUBLE PRECISION;
ALTER TABLE "event_venue_table_bookings" ADD COLUMN IF NOT EXISTS "platform_fee_zar" DOUBLE PRECISION;
ALTER TABLE "event_venue_table_bookings" ADD COLUMN IF NOT EXISTS "settlement_mode" TEXT;
ALTER TABLE "event_venue_table_bookings" ADD COLUMN IF NOT EXISTS "decline_reason" TEXT;

ALTER TABLE "hosted_table_members" ADD COLUMN IF NOT EXISTS "decline_reason" TEXT;

CREATE TABLE IF NOT EXISTS "celebration_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "guest_count" INTEGER,
    "preferred_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "venue_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "celebration_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "celebration_requests_user_id_idx" ON "celebration_requests"("user_id");
CREATE INDEX IF NOT EXISTS "celebration_requests_venue_id_idx" ON "celebration_requests"("venue_id");
CREATE INDEX IF NOT EXISTS "celebration_requests_status_idx" ON "celebration_requests"("status");

ALTER TABLE "celebration_requests" ADD CONSTRAINT "celebration_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "celebration_requests" ADD CONSTRAINT "celebration_requests_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
