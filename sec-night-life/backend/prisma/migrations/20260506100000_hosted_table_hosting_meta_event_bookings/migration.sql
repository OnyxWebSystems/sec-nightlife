-- CreateEnum
CREATE TYPE "HostingTableCategory" AS ENUM ('GENERAL', 'VIP');

-- AlterTable
ALTER TABLE "hosted_tables" ADD COLUMN "hosting_category" "HostingTableCategory";
ALTER TABLE "hosted_tables" ADD COLUMN "hosting_tier_index" INTEGER;
ALTER TABLE "hosted_tables" ADD COLUMN "tier_max_guests" INTEGER;
ALTER TABLE "hosted_tables" ADD COLUMN "tier_min_spend" DOUBLE PRECISION;
ALTER TABLE "hosted_tables" ADD COLUMN "host_fee_paystack_ref" TEXT;

CREATE UNIQUE INDEX "hosted_tables_host_fee_paystack_ref_key" ON "hosted_tables"("host_fee_paystack_ref");

-- CreateTable
CREATE TABLE "event_venue_table_bookings" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "hosted_table_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "paystack_reference" TEXT,
    "amount_total" DOUBLE PRECISION,
    "entrance_zar" DOUBLE PRECISION,
    "component_zar" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_venue_table_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_venue_table_bookings_venue_id_idx" ON "event_venue_table_bookings"("venue_id");
CREATE INDEX "event_venue_table_bookings_event_id_idx" ON "event_venue_table_bookings"("event_id");
CREATE INDEX "event_venue_table_bookings_hosted_table_id_idx" ON "event_venue_table_bookings"("hosted_table_id");
CREATE INDEX "event_venue_table_bookings_user_id_idx" ON "event_venue_table_bookings"("user_id");

ALTER TABLE "event_venue_table_bookings" ADD CONSTRAINT "event_venue_table_bookings_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_venue_table_bookings" ADD CONSTRAINT "event_venue_table_bookings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_venue_table_bookings" ADD CONSTRAINT "event_venue_table_bookings_hosted_table_id_fkey" FOREIGN KEY ("hosted_table_id") REFERENCES "hosted_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_venue_table_bookings" ADD CONSTRAINT "event_venue_table_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
