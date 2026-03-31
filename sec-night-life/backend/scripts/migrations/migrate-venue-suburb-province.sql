-- Migration: Add venue suburb/province fields (Issue 1)
-- Run this in Neon Console → SQL Editor (project database) if your `neon-schema.sql` has already been applied.

-- ─── Add missing columns ────────────────────────────────────────────────
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "suburb" TEXT;
ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "province" TEXT;

-- ─── Indexes (optional but useful) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS "venues_suburb_idx" ON "venues"("suburb");
CREATE INDEX IF NOT EXISTS "venues_province_idx" ON "venues"("province");

