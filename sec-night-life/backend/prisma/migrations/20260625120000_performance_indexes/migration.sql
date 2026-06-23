-- Performance indexes for feed, table offerings, friend suggestions, and event stats.

CREATE INDEX IF NOT EXISTS "messages_chat_id_created_at_idx" ON "messages"("chat_id", "created_at");

CREATE INDEX IF NOT EXISTS "venue_tables_event_id_is_active_status_idx" ON "venue_tables"("event_id", "is_active", "status");

CREATE INDEX IF NOT EXISTS "promotions_status_start_at_end_at_idx" ON "promotions"("status", "start_at", "end_at");

CREATE INDEX IF NOT EXISTS "user_profiles_city_idx" ON "user_profiles"("city");

CREATE INDEX IF NOT EXISTS "event_attendance_event_id_confirmed_idx" ON "event_attendance"("event_id", "confirmed");
