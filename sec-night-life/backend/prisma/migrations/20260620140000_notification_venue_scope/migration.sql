-- Add optional venue scope to notifications (per-venue isolation for multi-venue owners)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "venue_id" TEXT;
ALTER TABLE "in_app_notifications" ADD COLUMN IF NOT EXISTS "venue_id" TEXT;

CREATE INDEX IF NOT EXISTS "notifications_user_id_venue_id_idx" ON "notifications"("user_id", "venue_id");
CREATE INDEX IF NOT EXISTS "in_app_notifications_user_id_venue_id_idx" ON "in_app_notifications"("user_id", "venue_id");

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
