-- Add optional per-event location overrides for business-owner branches.
ALTER TABLE "events"
ADD COLUMN "location_address" TEXT,
ADD COLUMN "location_city" TEXT,
ADD COLUMN "location_suburb" TEXT,
ADD COLUMN "location_province" TEXT;
