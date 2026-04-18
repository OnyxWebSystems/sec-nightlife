-- AlterTable
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "max_hosted_tables" INTEGER;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "table_pricing_tiers" JSONB;

-- AlterTable
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "is_public" BOOLEAN NOT NULL DEFAULT true;
