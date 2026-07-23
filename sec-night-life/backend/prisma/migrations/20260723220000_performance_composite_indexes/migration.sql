-- Hot-path composite indexes for Home feed, promotions, and table listings.

CREATE INDEX IF NOT EXISTS "promotions_deleted_status_end_at_idx"
  ON "promotions"("deleted_at", "status", "end_at");

CREATE INDEX IF NOT EXISTS "venue_tables_is_active_status_idx"
  ON "venue_tables"("is_active", "status");

CREATE INDEX IF NOT EXISTS "events_deleted_status_ends_at_idx"
  ON "events"("deleted_at", "status", "ends_at");

CREATE INDEX IF NOT EXISTS "hosted_tables_status_spots_event_date_idx"
  ON "hosted_tables"("status", "spots_remaining", "event_date");
