-- Migration: Add onboarding skip support + future feature tables
-- Run this in Neon Console → SQL Editor if your database already exists

-- ─── Add missing columns to user_profiles ────────────────────────────────
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "favorite_drink" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "date_of_birth" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "id_document_url" TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "verification_status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "payment_setup_complete" BOOLEAN NOT NULL DEFAULT false;

-- ─── Future: Live Venue Popularity ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "venue_popularity" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "event_id" TEXT,
    "current_check_ins" INTEGER NOT NULL DEFAULT 0,
    "popularity_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "queue_time" INTEGER,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_popularity_pkey" PRIMARY KEY ("id")
);

-- ─── Future: Table Booking & Split Payments ──────────────────────────────
CREATE TABLE IF NOT EXISTS "table_bookings" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "organizer_user_id" TEXT NOT NULL,
    "total_cost" DOUBLE PRECISION NOT NULL,
    "split_count" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "table_bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "table_booking_splits" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "payment_ref" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "table_booking_splits_pkey" PRIMARY KEY ("id")
);

-- ─── Future: Party Groups / Crews ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "party_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatar_url" TEXT,
    "created_by" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "party_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "party_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "party_group_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "party_group_invitations" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "invitee_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    CONSTRAINT "party_group_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "party_group_events" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "event_id" TEXT,
    "venue_id" TEXT,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planning',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "party_group_events_pkey" PRIMARY KEY ("id")
);

-- ─── Indexes (using IF NOT EXISTS where supported) ───────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "venue_popularity_venue_id_event_id_key" ON "venue_popularity"("venue_id", "event_id");
CREATE INDEX IF NOT EXISTS "venue_popularity_venue_id_idx" ON "venue_popularity"("venue_id");
CREATE INDEX IF NOT EXISTS "venue_popularity_popularity_score_idx" ON "venue_popularity"("popularity_score");

CREATE INDEX IF NOT EXISTS "table_bookings_table_id_idx" ON "table_bookings"("table_id");
CREATE INDEX IF NOT EXISTS "table_bookings_organizer_user_id_idx" ON "table_bookings"("organizer_user_id");
CREATE INDEX IF NOT EXISTS "table_bookings_status_idx" ON "table_bookings"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "table_booking_splits_booking_id_user_id_key" ON "table_booking_splits"("booking_id", "user_id");
CREATE INDEX IF NOT EXISTS "table_booking_splits_booking_id_idx" ON "table_booking_splits"("booking_id");
CREATE INDEX IF NOT EXISTS "table_booking_splits_user_id_idx" ON "table_booking_splits"("user_id");
CREATE INDEX IF NOT EXISTS "table_booking_splits_payment_status_idx" ON "table_booking_splits"("payment_status");

CREATE INDEX IF NOT EXISTS "party_groups_created_by_idx" ON "party_groups"("created_by");

CREATE UNIQUE INDEX IF NOT EXISTS "party_group_members_group_id_user_id_key" ON "party_group_members"("group_id", "user_id");
CREATE INDEX IF NOT EXISTS "party_group_members_group_id_idx" ON "party_group_members"("group_id");
CREATE INDEX IF NOT EXISTS "party_group_members_user_id_idx" ON "party_group_members"("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "party_group_invitations_group_id_invitee_id_key" ON "party_group_invitations"("group_id", "invitee_id");
CREATE INDEX IF NOT EXISTS "party_group_invitations_group_id_idx" ON "party_group_invitations"("group_id");
CREATE INDEX IF NOT EXISTS "party_group_invitations_invitee_id_idx" ON "party_group_invitations"("invitee_id");
CREATE INDEX IF NOT EXISTS "party_group_invitations_status_idx" ON "party_group_invitations"("status");

CREATE INDEX IF NOT EXISTS "party_group_events_group_id_idx" ON "party_group_events"("group_id");
CREATE INDEX IF NOT EXISTS "party_group_events_event_id_idx" ON "party_group_events"("event_id");

-- ─── Foreign keys ────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "venue_popularity" ADD CONSTRAINT "venue_popularity_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "table_bookings" ADD CONSTRAINT "table_bookings_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "table_booking_splits" ADD CONSTRAINT "table_booking_splits_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "table_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "party_group_members" ADD CONSTRAINT "party_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "party_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "party_group_invitations" ADD CONSTRAINT "party_group_invitations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "party_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "party_group_events" ADD CONSTRAINT "party_group_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "party_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
