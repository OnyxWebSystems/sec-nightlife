-- DEPRECATED: This legacy DDL used column name `type` (not `promotion_type`) and does not match Prisma.
-- For new databases use: `cd backend && npx prisma migrate deploy`
-- To fix an existing Neon DB created from this script, run:
--   scripts/migrations/align-promotions-with-prisma.sql
-- (same SQL as prisma/migrations/20260410140000_align_promotions_with_prisma/migration.sql)

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
