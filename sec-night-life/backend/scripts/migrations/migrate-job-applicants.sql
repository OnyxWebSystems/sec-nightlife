-- Add applicants JSON column to jobs for job applications
-- Run this on Neon SQL Editor

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applicants JSONB DEFAULT '[]'::jsonb;

