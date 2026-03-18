-- Enable host-created events to post jobs + add service ratings aggregates
-- Run this in the Neon SQL editor (safe to re-run).

-- 1) Allow jobs without a venue (for Host Events)
ALTER TABLE jobs
  ALTER COLUMN venue_id DROP NOT NULL;

-- 2) Link a job to an informal Host Event (optional)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS host_event_id TEXT;

CREATE INDEX IF NOT EXISTS jobs_host_event_id_idx ON jobs (host_event_id);

-- 3) Service rating aggregates on user_profiles (used for hiring signals)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS service_rating_avg DOUBLE PRECISION DEFAULT 0;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS service_rating_count INTEGER DEFAULT 0;

-- 4) Store individual service ratings (auditable history)
CREATE TABLE IF NOT EXISTS service_ratings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rater_user_id TEXT NOT NULL,
  ratee_user_id TEXT NOT NULL,
  context_type TEXT NOT NULL, -- 'job' | 'host_event' | 'event'
  context_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_ratings_ratee_idx ON service_ratings (ratee_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_ratings_context_idx ON service_ratings (context_type, context_id);

