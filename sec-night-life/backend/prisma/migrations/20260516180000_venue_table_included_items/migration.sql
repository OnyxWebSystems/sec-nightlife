-- AlterTable
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "hosting_tier_key" TEXT;
ALTER TABLE "venue_tables" ADD COLUMN IF NOT EXISTS "included_items" JSONB;
