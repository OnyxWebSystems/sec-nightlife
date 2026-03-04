-- ============================================================
-- SEC Night Life — Hardening & Stabilization Migration
-- Run this in Neon SQL Editor (or via npm run db:migrate-hardening)
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- 2. Create profile_views table
CREATE TABLE IF NOT EXISTS profile_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   UUID NOT NULL,
  viewed_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer ON profile_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed ON profile_views(viewed_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_created ON profile_views(created_at);

-- 3. Create reputation_scores table
CREATE TABLE IF NOT EXISTS reputation_scores (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE,
  score                FLOAT NOT NULL DEFAULT 50,
  attendance_score     FLOAT NOT NULL DEFAULT 0,
  reports_received     INT NOT NULL DEFAULT 0,
  blocks_received      INT NOT NULL DEFAULT 0,
  event_participation  INT NOT NULL DEFAULT 0,
  table_participation  INT NOT NULL DEFAULT 0,
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reputation_user ON reputation_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_score ON reputation_scores(score);

-- 4. Ensure audit_logs table has all required columns (already exists from initial schema)
-- Add user_agent column if missing
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 5. Add suspended_at index for fast admin queries
CREATE INDEX IF NOT EXISTS idx_users_suspended ON users(suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_premium ON users(is_premium) WHERE is_premium = true;

-- Done
SELECT 'Migration complete' AS status;
