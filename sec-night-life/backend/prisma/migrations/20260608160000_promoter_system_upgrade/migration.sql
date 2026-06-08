-- Promoter system upgrade: position roles, venue roster, event assignments, conversions

CREATE TYPE "PositionRole" AS ENUM ('PROMOTER', 'VENUE_STAFF');
CREATE TYPE "VenuePromoterStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "EventPromoterAssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'REVOKED');
CREATE TYPE "PromoterConversionType" AS ENUM ('TICKET_PURCHASE', 'TABLE_HOST', 'TABLE_JOIN');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROMOTER_EVENT_ASSIGNED';

ALTER TABLE "job_postings" ADD COLUMN "position_role" "PositionRole" NOT NULL DEFAULT 'VENUE_STAFF';
CREATE INDEX "job_postings_position_role_idx" ON "job_postings"("position_role");

CREATE TABLE "venue_promoters" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "promoter_user_id" TEXT NOT NULL,
    "job_application_id" TEXT,
    "hired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "VenuePromoterStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "venue_promoters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_promoters_venue_id_promoter_user_id_key" ON "venue_promoters"("venue_id", "promoter_user_id");
CREATE INDEX "venue_promoters_venue_id_status_idx" ON "venue_promoters"("venue_id", "status");
CREATE INDEX "venue_promoters_promoter_user_id_idx" ON "venue_promoters"("promoter_user_id");

ALTER TABLE "venue_promoters" ADD CONSTRAINT "venue_promoters_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_promoters" ADD CONSTRAINT "venue_promoters_promoter_user_id_fkey" FOREIGN KEY ("promoter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "event_promoter_assignments" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "promoter_user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EventPromoterAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "event_promoter_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_promoter_assignments_event_id_promoter_user_id_key" ON "event_promoter_assignments"("event_id", "promoter_user_id");
CREATE INDEX "event_promoter_assignments_event_id_status_idx" ON "event_promoter_assignments"("event_id", "status");
CREATE INDEX "event_promoter_assignments_promoter_user_id_status_idx" ON "event_promoter_assignments"("promoter_user_id", "status");
CREATE INDEX "event_promoter_assignments_venue_id_idx" ON "event_promoter_assignments"("venue_id");

ALTER TABLE "event_promoter_assignments" ADD CONSTRAINT "event_promoter_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_promoter_assignments" ADD CONSTRAINT "event_promoter_assignments_promoter_user_id_fkey" FOREIGN KEY ("promoter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_promoter_assignments" ADD CONSTRAINT "event_promoter_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "promoter_conversions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "promoter_user_id" TEXT NOT NULL,
    "conversion_type" "PromoterConversionType" NOT NULL,
    "buyer_user_id" TEXT NOT NULL,
    "amount_zar" DOUBLE PRECISION,
    "points_awarded" INTEGER NOT NULL,
    "paystack_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promoter_conversions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "promoter_conversions_promoter_user_id_created_at_idx" ON "promoter_conversions"("promoter_user_id", "created_at");
CREATE INDEX "promoter_conversions_event_id_idx" ON "promoter_conversions"("event_id");
CREATE INDEX "promoter_conversions_paystack_reference_idx" ON "promoter_conversions"("paystack_reference");

ALTER TABLE "promoter_conversions" ADD CONSTRAINT "promoter_conversions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promoter_conversions" ADD CONSTRAINT "promoter_conversions_promoter_user_id_fkey" FOREIGN KEY ("promoter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promoter_conversions" ADD CONSTRAINT "promoter_conversions_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tickets" ADD COLUMN "promoter_user_id" TEXT;
CREATE INDEX "tickets_promoter_user_id_idx" ON "tickets"("promoter_user_id");

ALTER TABLE "event_venue_table_bookings" ADD COLUMN "promoter_user_id" TEXT;
CREATE INDEX "event_venue_table_bookings_promoter_user_id_idx" ON "event_venue_table_bookings"("promoter_user_id");
