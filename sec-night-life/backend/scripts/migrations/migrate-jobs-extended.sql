-- Migrate jobs table: add optional event_id, description, pay, shift, contact fields
-- Run this on Neon if using raw SQL migrations

-- Make event_id nullable
ALTER TABLE jobs ALTER COLUMN event_id DROP NOT NULL;

-- Add new columns
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS suggested_pay_amount INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS suggested_pay_type VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_time VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS end_time VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contact_details TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS date VARCHAR(20);
