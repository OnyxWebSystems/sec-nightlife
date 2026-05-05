-- CreateEnum
CREATE TYPE "GuestGenderPreference" AS ENUM ('ANY', 'MALE_ONLY', 'FEMALE_ONLY', 'OTHER_ONLY');

-- CreateEnum
CREATE TYPE "TicketKind" AS ENUM (
  'EVENT_TICKET',
  'TABLE_JOIN',
  'HOSTED_TABLE_JOIN',
  'HOUSE_PARTY',
  'TABLE_HOST_FEE',
  'EXTERNAL_HOSTED_LISTING',
  'VENUE_TABLE_JOIN'
);

-- CreateEnum
CREATE TYPE "PayoutRecipientType" AS ENUM ('USER', 'VENUE', 'PLATFORM');

-- CreateEnum
CREATE TYPE "PayoutLedgerStatus" AS ENUM ('PENDING', 'TRANSFERRED', 'FAILED', 'SKIPPED_NO_RECIPIENT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "paystack_recipient_code" TEXT;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN "paystack_recipient_code" TEXT;

-- AlterTable
ALTER TABLE "tables" ADD COLUMN "guest_gender_preference" "GuestGenderPreference" NOT NULL DEFAULT 'ANY';
ALTER TABLE "tables" ADD COLUMN "host_fee_paystack_ref" TEXT;

CREATE UNIQUE INDEX "tables_host_fee_paystack_ref_key" ON "tables"("host_fee_paystack_ref");

-- AlterTable
ALTER TABLE "house_parties" ADD COLUMN "guest_gender_preference" "GuestGenderPreference" NOT NULL DEFAULT 'ANY';

-- AlterTable
ALTER TABLE "hosted_tables" ADD COLUMN "guest_gender_preference" "GuestGenderPreference" NOT NULL DEFAULT 'ANY';
ALTER TABLE "hosted_tables" ADD COLUMN "external_listing_paystack_ref" TEXT;

-- AlterTable
ALTER TABLE "house_party_attendees" ADD COLUMN "paystack_reference" TEXT;

-- AlterTable
ALTER TABLE "hosted_table_members" ADD COLUMN "paystack_reference" TEXT;
ALTER TABLE "hosted_table_members" ADD COLUMN "join_fee_paid" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "TicketKind" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "paystack_reference" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "house_party_id" TEXT,
    "table_id" TEXT,
    "hosted_table_id" TEXT,
    "event_id" TEXT,
    "venue_table_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "visible_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_ledgers" (
    "id" TEXT NOT NULL,
    "payment_reference" TEXT NOT NULL,
    "gross_amount" DOUBLE PRECISION NOT NULL,
    "sec_amount" DOUBLE PRECISION NOT NULL,
    "recipient_amount" DOUBLE PRECISION NOT NULL,
    "recipient_type" "PayoutRecipientType" NOT NULL,
    "recipient_user_id" TEXT,
    "recipient_venue_id" TEXT,
    "status" "PayoutLedgerStatus" NOT NULL DEFAULT 'PENDING',
    "paystack_transfer_ref" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_paystack_reference_key" ON "tickets"("paystack_reference");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_qr_token_key" ON "tickets"("qr_token");

-- CreateIndex
CREATE INDEX "tickets_user_id_idx" ON "tickets"("user_id");

-- CreateIndex
CREATE INDEX "tickets_visible_until_idx" ON "tickets"("visible_until");

-- CreateIndex
CREATE INDEX "payout_ledgers_payment_reference_idx" ON "payout_ledgers"("payment_reference");

-- CreateIndex
CREATE INDEX "payout_ledgers_recipient_user_id_idx" ON "payout_ledgers"("recipient_user_id");

-- CreateIndex
CREATE INDEX "payout_ledgers_recipient_venue_id_idx" ON "payout_ledgers"("recipient_venue_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_ledgers" ADD CONSTRAINT "payout_ledgers_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_ledgers" ADD CONSTRAINT "payout_ledgers_recipient_venue_id_fkey" FOREIGN KEY ("recipient_venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
