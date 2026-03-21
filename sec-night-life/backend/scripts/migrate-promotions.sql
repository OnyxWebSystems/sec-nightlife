-- Promotions table for BusinessPromotions page
-- Run in Neon SQL editor (safe to re-run).

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  venue_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  boost_status TEXT NOT NULL DEFAULT 'none',
  boost_ref TEXT,
  boost_paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS promotions_venue_idx ON promotions (venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promotions_status_idx ON promotions (status);
CREATE INDEX IF NOT EXISTS promotions_boost_status_idx ON promotions (boost_status);

