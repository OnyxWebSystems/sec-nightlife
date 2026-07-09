-- AlterEnum
ALTER TYPE "TicketKind" ADD VALUE IF NOT EXISTS 'EVENT_ENTRANCE';

-- AlterTable
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "table_category" TEXT;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "include_entrance_fee" BOOLEAN NOT NULL DEFAULT true;
