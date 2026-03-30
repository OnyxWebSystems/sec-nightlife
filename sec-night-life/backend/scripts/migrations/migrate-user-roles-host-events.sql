-- Add user_roles and host_events tables
-- Run this on Neon SQL Editor

-- User roles (explicit account types: partygoer, host, business)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role_type)
);
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_type_idx ON user_roles(role_type);

-- Host events (informal: house parties, boat parties, etc.)
CREATE TABLE IF NOT EXISTS host_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  location VARCHAR(255),
  city VARCHAR(100),
  capacity INT,
  entry_cost DECIMAL(10,2),
  guest_approval_required BOOLEAN DEFAULT true,
  status VARCHAR(50) DEFAULT 'draft',
  cover_image_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS host_events_host_user_id_idx ON host_events(host_user_id);
CREATE INDEX IF NOT EXISTS host_events_date_idx ON host_events(date);
CREATE INDEX IF NOT EXISTS host_events_status_idx ON host_events(status);
