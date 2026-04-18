-- CreateEnum
CREATE TYPE "TableCategory" AS ENUM ('general', 'vip');

-- AlterTable
ALTER TABLE "tables" ADD COLUMN "table_category" "TableCategory" NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE "events" ADD COLUMN "hosting_config" JSONB;

-- Migrate legacy caps/tiers into hosting_config.general; seed empty vip section
UPDATE "events"
SET "hosting_config" = jsonb_build_object(
  'general', jsonb_build_object(
    'max_tables', "max_hosted_tables",
    'tiers', COALESCE("table_pricing_tiers", '[]'::jsonb)
  ),
  'vip', jsonb_build_object(
    'max_tables', NULL::integer,
    'tiers', '[]'::jsonb
  )
);

ALTER TABLE "events" DROP COLUMN "max_hosted_tables";
ALTER TABLE "events" DROP COLUMN "table_pricing_tiers";
