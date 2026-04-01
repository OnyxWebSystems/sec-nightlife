-- Migration: add SUPER_ADMIN to UserRole enum
-- Safe for PostgreSQL environments where the enum already includes the value.

DO $$
BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
