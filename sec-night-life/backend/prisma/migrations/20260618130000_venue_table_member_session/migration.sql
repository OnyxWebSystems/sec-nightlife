-- Persist session number on venue table members for day booking history after reset.
ALTER TABLE "venue_table_members" ADD COLUMN IF NOT EXISTS "table_session_number" INTEGER;

-- Backfill LEFT members: attribute to the session before the slot's current counter.
UPDATE "venue_table_members" m
SET "table_session_number" = GREATEST(1, COALESCE(vt."table_session_number", 1) - 1)
FROM "venue_tables" vt
WHERE m."venue_table_id" = vt."id"
  AND m."table_session_number" IS NULL
  AND m."status" = 'LEFT';

-- CONFIRMED members on active slots use the slot's current session.
UPDATE "venue_table_members" m
SET "table_session_number" = COALESCE(vt."table_session_number", 1)
FROM "venue_tables" vt
WHERE m."venue_table_id" = vt."id"
  AND m."table_session_number" IS NULL
  AND m."status" = 'CONFIRMED';
