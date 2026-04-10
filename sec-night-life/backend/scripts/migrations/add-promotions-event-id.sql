-- Run once in Neon SQL editor if `prisma migrate deploy` is not used.
-- Adds promotions.event_id for optional event-linked promotions.

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
