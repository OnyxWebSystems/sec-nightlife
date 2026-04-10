-- Promotions: optional link to an event (matches Prisma Promotion.eventId -> event_id)
-- Safe to re-run on Neon: uses IF NOT EXISTS where supported.

ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "event_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promotions_event_id_fkey'
  ) THEN
    ALTER TABLE "promotions"
      ADD CONSTRAINT "promotions_event_id_fkey"
      FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "promotions_event_id_idx" ON "promotions"("event_id");
