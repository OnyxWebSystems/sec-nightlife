-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'REJECTED', 'APPROVED', 'PAID_BY_VENUE');

-- CreateEnum
CREATE TYPE "RefundType" AS ENUM ('TICKET', 'TABLE_HOST', 'TABLE_JOIN');

-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED');

-- AlterEnum
ALTER TYPE "VenueTableMemberStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "refund_status" "PaymentRefundStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "payments" ADD COLUMN "refunded_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "refund_request_id" TEXT;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "refunded_at" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "refund_request_id" TEXT;

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "payment_reference" TEXT NOT NULL,
    "refund_type" "RefundType" NOT NULL,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "user_reason" TEXT NOT NULL,
    "user_wallet_code" TEXT NOT NULL,
    "reject_template_keys" JSONB,
    "reject_params" JSONB,
    "gross_amount_zar" DOUBLE PRECISION NOT NULL,
    "venue_refund_due_zar" DOUBLE PRECISION NOT NULL,
    "platform_fee_kept_zar" DOUBLE PRECISION NOT NULL,
    "ticket_ids" JSONB,
    "venue_table_member_id" TEXT,
    "venue_table_id" TEXT,
    "event_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refund_requests_user_id_idx" ON "refund_requests"("user_id");
CREATE INDEX "refund_requests_venue_id_idx" ON "refund_requests"("venue_id");
CREATE INDEX "refund_requests_payment_reference_idx" ON "refund_requests"("payment_reference");
CREATE INDEX "refund_requests_status_idx" ON "refund_requests"("status");
CREATE INDEX "refund_requests_venue_id_status_idx" ON "refund_requests"("venue_id", "status");
CREATE UNIQUE INDEX "payments_refund_request_id_key" ON "payments"("refund_request_id");
CREATE INDEX "payments_refund_status_idx" ON "payments"("refund_status");
CREATE INDEX "tickets_refunded_at_idx" ON "tickets"("refunded_at");

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_request_id_fkey" FOREIGN KEY ("refund_request_id") REFERENCES "refund_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
