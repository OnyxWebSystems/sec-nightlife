-- Add followed_venues to user_profiles for venue follow functionality
-- Run in Neon SQL Editor

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS followed_venues TEXT[] DEFAULT '{}';
