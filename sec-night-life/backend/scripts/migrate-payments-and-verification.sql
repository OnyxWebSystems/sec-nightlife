-- Migration: Payment model + verification notes
-- Run this against your Neon database

-- Payments table (canonical Paystack payment records)
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT NOT NULL DEFAULT 'other',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type);

-- Verification rejection notes (for manual admin review)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS verification_rejection_note TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS compliance_document_url TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS compliance_rejection_note TEXT;
