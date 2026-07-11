-- Party-goer preferred location + vendor business listings
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_label TEXT,
  ADD COLUMN IF NOT EXISTS has_vendor_interest BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_listing_deferred BOOLEAN NOT NULL DEFAULT false;

-- Add VENDOR_LISTING_REMINDER to NotificationType enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'VENDOR_LISTING_REMINDER'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'VENDOR_LISTING_REMINDER';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vendor_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS vendor_businesses_user_id_idx ON vendor_businesses(user_id);
CREATE INDEX IF NOT EXISTS vendor_businesses_category_idx ON vendor_businesses(category);
CREATE INDEX IF NOT EXISTS vendor_businesses_city_idx ON vendor_businesses(city);
CREATE INDEX IF NOT EXISTS vendor_businesses_is_published_idx ON vendor_businesses(is_published);

CREATE TABLE IF NOT EXISTS vendor_business_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_business_id UUID NOT NULL REFERENCES vendor_businesses(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_business_images_vendor_business_id_idx
  ON vendor_business_images(vendor_business_id);
