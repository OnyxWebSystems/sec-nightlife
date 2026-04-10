-- Use if the full align script stopped at step 6 with:
--   ERROR: default for column "status" cannot be cast automatically to type "PromotionStatus"
-- This file is steps 6–10 of align-promotions-with-prisma.sql (fixed: DROP DEFAULT before ALTER TYPE).
-- Safe to run after a partial run; idempotent where possible.

-- 6) status: TEXT -> PromotionStatus
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
