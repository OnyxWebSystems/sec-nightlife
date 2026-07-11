-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VENDOR_LISTING_REMINDER';

-- AlterTable user_profiles
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "location_label" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "has_vendor_interest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "vendor_listing_deferred" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "vendor_businesses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vendor_businesses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vendor_business_images" (
    "id" TEXT NOT NULL,
    "vendor_business_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_business_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vendor_businesses_user_id_idx" ON "vendor_businesses"("user_id");
CREATE INDEX IF NOT EXISTS "vendor_businesses_category_idx" ON "vendor_businesses"("category");
CREATE INDEX IF NOT EXISTS "vendor_businesses_city_idx" ON "vendor_businesses"("city");
CREATE INDEX IF NOT EXISTS "vendor_businesses_is_published_idx" ON "vendor_businesses"("is_published");
CREATE INDEX IF NOT EXISTS "vendor_business_images_vendor_business_id_idx" ON "vendor_business_images"("vendor_business_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_businesses_user_id_fkey'
  ) THEN
    ALTER TABLE "vendor_businesses" ADD CONSTRAINT "vendor_businesses_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_business_images_vendor_business_id_fkey'
  ) THEN
    ALTER TABLE "vendor_business_images" ADD CONSTRAINT "vendor_business_images_vendor_business_id_fkey"
      FOREIGN KEY ("vendor_business_id") REFERENCES "vendor_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
