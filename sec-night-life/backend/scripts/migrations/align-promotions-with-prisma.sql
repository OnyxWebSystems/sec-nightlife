-- Paste into Neon SQL editor (same as prisma/migrations/20260410140000_align_promotions_with_prisma/migration.sql).
-- Fixes: missing promotion_type (legacy column was `type`), status enums, Prisma columns, legacy boost_* cleanup.

-- Align legacy `promotions` table (type/status text, boost_* columns) with Prisma schema.
-- Safe to re-run on Neon: guards use information_schema / udt_name checks.

-- 1) Enums (match prisma/schema.prisma)
DO $$ BEGIN
  CREATE TYPE "PromotionType" AS ENUM ('VENUE_PROMOTION', 'EVENT_PROMOTION', 'SPECIAL_OFFER', 'ANNOUNCEMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Legacy column was `type`; Prisma maps to `promotion_type`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions' AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions' AND column_name = 'promotion_type'
  ) THEN
    ALTER TABLE "promotions" RENAME COLUMN "type" TO "promotion_type";
  END IF;
END $$;

-- 3) Ensure promotion_type exists (edge case: empty / partial table)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions' AND column_name = 'promotion_type'
  ) THEN
    ALTER TABLE "promotions" ADD COLUMN "promotion_type" "PromotionType" NOT NULL DEFAULT 'VENUE_PROMOTION'::"PromotionType";
  END IF;
END $$;

-- 4) Cast promotion_type from TEXT/VARCHAR to enum when not already PromotionType
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'promotions' AND c.column_name = 'promotion_type'
      AND c.udt_name <> 'PromotionType'
  ) THEN
    ALTER TABLE "promotions" ALTER COLUMN "promotion_type" DROP DEFAULT;
    ALTER TABLE "promotions"
      ALTER COLUMN "promotion_type" TYPE "PromotionType"
      USING (
        CASE UPPER(TRIM("promotion_type"::text))
          WHEN 'VENUE_PROMOTION' THEN 'VENUE_PROMOTION'::"PromotionType"
          WHEN 'EVENT_PROMOTION' THEN 'EVENT_PROMOTION'::"PromotionType"
          WHEN 'SPECIAL_OFFER' THEN 'SPECIAL_OFFER'::"PromotionType"
          WHEN 'ANNOUNCEMENT' THEN 'ANNOUNCEMENT'::"PromotionType"
          ELSE 'VENUE_PROMOTION'::"PromotionType"
        END
      );
    ALTER TABLE "promotions"
      ALTER COLUMN "promotion_type" SET DEFAULT 'VENUE_PROMOTION'::"PromotionType";
  END IF;
END $$;

-- 5) description NOT NULL (@db.Text)
UPDATE "promotions" SET "description" = '' WHERE "description" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'promotions' AND c.column_name = 'description'
      AND c.is_nullable = 'YES'
  ) THEN
    ALTER TABLE "promotions" ALTER COLUMN "description" SET NOT NULL;
  END IF;
END $$;

-- 6) status: TEXT -> PromotionStatus
-- Legacy default is text ('draft'); Postgres cannot cast that default to the enum — drop default first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'promotions' AND c.column_name = 'status'
      AND c.udt_name <> 'PromotionStatus'
  ) THEN
    ALTER TABLE "promotions" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "promotions"
      ALTER COLUMN "status" TYPE "PromotionStatus"
      USING (
        CASE LOWER(TRIM("status"::text))
          WHEN 'draft' THEN 'DRAFT'::"PromotionStatus"
          WHEN 'active' THEN 'ACTIVE'::"PromotionStatus"
          WHEN 'paused' THEN 'PAUSED'::"PromotionStatus"
          WHEN 'ended' THEN 'ENDED'::"PromotionStatus"
          ELSE 'DRAFT'::"PromotionStatus"
        END
      );
    ALTER TABLE "promotions"
      ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"PromotionStatus";
  END IF;
END $$;

-- 7) start_at / end_at NOT NULL
UPDATE "promotions" SET "start_at" = COALESCE("start_at", "created_at", now()) WHERE "start_at" IS NULL;
UPDATE "promotions" SET "end_at" = COALESCE("end_at", "start_at" + interval '1 day', now() + interval '1 day') WHERE "end_at" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'promotions' AND c.column_name = 'start_at'
      AND c.is_nullable = 'YES'
  ) THEN
    ALTER TABLE "promotions" ALTER COLUMN "start_at" SET NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'promotions' AND c.column_name = 'end_at'
      AND c.is_nullable = 'YES'
  ) THEN
    ALTER TABLE "promotions" ALTER COLUMN "end_at" SET NOT NULL;
  END IF;
END $$;

-- 8) Prisma columns missing from legacy DDL
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "image_public_id" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "target_city" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "boosted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "boosted_at" TIMESTAMPTZ;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "boost_expires_at" TIMESTAMPTZ;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "boost_paystack_ref" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "boost_impressions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "organic_impressions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "total_clicks" INTEGER NOT NULL DEFAULT 0;

-- 9) Copy legacy boost_* into Prisma columns, then drop legacy columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions' AND column_name = 'boost_ref'
  ) THEN
    UPDATE "promotions" SET "boost_paystack_ref" = COALESCE("boost_paystack_ref", "boost_ref");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions' AND column_name = 'boost_paid_at'
  ) THEN
    UPDATE "promotions" SET "boosted_at" = COALESCE("boosted_at", "boost_paid_at");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions' AND column_name = 'boost_status'
  ) THEN
    UPDATE "promotions" SET "boosted" = true
    WHERE LOWER(TRIM("boost_status"::text)) NOT IN ('none', '');
  END IF;
END $$;

ALTER TABLE "promotions" DROP COLUMN IF EXISTS "boost_status";
ALTER TABLE "promotions" DROP COLUMN IF EXISTS "boost_ref";
ALTER TABLE "promotions" DROP COLUMN IF EXISTS "boost_paid_at";

-- 10) Indexes (Prisma @@index)
CREATE INDEX IF NOT EXISTS "promotions_venue_id_idx" ON "promotions"("venue_id");
CREATE INDEX IF NOT EXISTS "promotions_status_idx" ON "promotions"("status");
CREATE INDEX IF NOT EXISTS "promotions_target_city_idx" ON "promotions"("target_city");
CREATE INDEX IF NOT EXISTS "promotions_boosted_boost_expires_at_idx" ON "promotions"("boosted", "boost_expires_at");
