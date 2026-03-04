-- ============================================================
-- SEC Nightlife — Pre-Production Migration
-- Run this in Neon SQL Editor or via: npm run db:migrate-preprod
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Rename verification_token → verification_token_hash (store hash, not raw token)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'verification_token'
  ) THEN
    ALTER TABLE users RENAME COLUMN verification_token TO verification_token_hash;
  END IF;
END $$;

-- 2. Rename reset_token → reset_token_hash (store hash, not raw token)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'reset_token'
  ) THEN
    ALTER TABLE users RENAME COLUMN reset_token TO reset_token_hash;
  END IF;
END $$;

-- 3. Ensure email_verified column exists (should already from initial schema)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- 4. Ensure verification_expiry column exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expiry TIMESTAMPTZ;

-- 5. Ensure reset_token_expiry column exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

-- 6. Add is_premium, suspended_at, suspended_reason (from hardening migration — idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- 7. Create profile_views table (idempotent)
CREATE TABLE IF NOT EXISTS profile_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   UUID NOT NULL,
  viewed_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer ON profile_views(viewer_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed ON profile_views(viewed_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_created ON profile_views(created_at);

-- 8. Create reputation_scores table (idempotent)
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

-- 9. Ensure audit_logs has user_agent column
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 10. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_suspended ON users(suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_premium ON users(is_premium) WHERE is_premium = true;
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_verification_hash ON users(verification_token_hash) WHERE verification_token_hash IS NOT NULL;

SELECT 'Pre-production migration complete' AS status;
