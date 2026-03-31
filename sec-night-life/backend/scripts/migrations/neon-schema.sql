-- Run this entire file in Neon Console → SQL Editor (project: sec-nightlife-prod, database: neondb)
-- Then restart your backend and try Sign up again.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'VENUE', 'FREELANCER', 'ADMIN', 'MODERATOR');
CREATE TYPE "VenueComplianceStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "EventStatus" AS ENUM ('draft', 'published', 'cancelled');
CREATE TYPE "TableStatus" AS ENUM ('open', 'full', 'closed');
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "full_name" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" TEXT,
    "verification_expiry" TIMESTAMP(3),
    "reset_token" TEXT,
    "reset_token_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT,
    "bio" TEXT,
    "city" TEXT,
    "avatar_url" TEXT,
    "favorite_drink" TEXT,
    "date_of_birth" TEXT,
    "id_document_url" TEXT,
    "age_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" TEXT NOT NULL DEFAULT 'pending',
    "payment_setup_complete" BOOLEAN NOT NULL DEFAULT false,
    "is_verified_promoter" BOOLEAN NOT NULL DEFAULT false,
    "social_reputation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "behaviour_score" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "music_preferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "friends" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue_type" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "suburb" TEXT,
    "province" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bio" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "compliance_status" "VenueComplianceStatus" NOT NULL DEFAULT 'pending',
    "logo_url" TEXT,
    "cover_image_url" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "capacity" INTEGER,
    "age_limit" INTEGER,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "performance_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transparency_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_reviews" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "event_id" TEXT,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_blocked_users" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_blocked_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "city" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "cover_image_url" TEXT,
    "banner_url" TEXT,
    "ticket_tiers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_attendance" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "checked_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_attendance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'open',
    "max_guests" INTEGER NOT NULL,
    "current_guests" INTEGER NOT NULL DEFAULT 0,
    "min_spend" DOUBLE PRECISION,
    "joining_fee" DOUBLE PRECISION,
    "members" JSONB NOT NULL DEFAULT '[]',
    "pending_requests" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "spots_available" INTEGER NOT NULL,
    "spots_filled" INTEGER NOT NULL DEFAULT 0,
    "city" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "blocks" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chats" (
    "id" TEXT NOT NULL,
    "related_table_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "action_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT,
    "event_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stripe_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "friend_requests" (
    "id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "venue_id" TEXT,
    "user_id" TEXT,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");
CREATE INDEX "venues_owner_user_id_idx" ON "venues"("owner_user_id");
CREATE INDEX "venues_city_idx" ON "venues"("city");
CREATE INDEX "venues_suburb_idx" ON "venues"("suburb");
CREATE INDEX "venues_province_idx" ON "venues"("province");
CREATE INDEX "venues_compliance_status_idx" ON "venues"("compliance_status");
CREATE INDEX "venue_reviews_venue_id_idx" ON "venue_reviews"("venue_id");
CREATE INDEX "venue_reviews_user_id_idx" ON "venue_reviews"("user_id");
CREATE INDEX "venue_reviews_event_id_idx" ON "venue_reviews"("event_id");
CREATE INDEX "venue_blocked_users_venue_id_idx" ON "venue_blocked_users"("venue_id");
CREATE UNIQUE INDEX "venue_blocked_users_venue_id_user_id_key" ON "venue_blocked_users"("venue_id", "user_id");
CREATE INDEX "events_venue_id_idx" ON "events"("venue_id");
CREATE INDEX "events_date_idx" ON "events"("date");
CREATE INDEX "events_status_idx" ON "events"("status");
CREATE INDEX "events_city_idx" ON "events"("city");
CREATE INDEX "event_attendance_event_id_idx" ON "event_attendance"("event_id");
CREATE INDEX "event_attendance_user_id_idx" ON "event_attendance"("user_id");
CREATE UNIQUE INDEX "event_attendance_event_id_user_id_key" ON "event_attendance"("event_id", "user_id");
CREATE INDEX "tables_event_id_idx" ON "tables"("event_id");
CREATE INDEX "tables_venue_id_idx" ON "tables"("venue_id");
CREATE INDEX "tables_host_user_id_idx" ON "tables"("host_user_id");
CREATE INDEX "tables_status_idx" ON "tables"("status");
CREATE INDEX "jobs_venue_id_idx" ON "jobs"("venue_id");
CREATE INDEX "jobs_event_id_idx" ON "jobs"("event_id");
CREATE INDEX "jobs_status_idx" ON "jobs"("status");
CREATE INDEX "blocks_blocker_id_idx" ON "blocks"("blocker_id");
CREATE INDEX "blocks_blocked_id_idx" ON "blocks"("blocked_id");
CREATE UNIQUE INDEX "blocks_blocker_id_blocked_id_key" ON "blocks"("blocker_id", "blocked_id");
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");
CREATE INDEX "reports_status_idx" ON "reports"("status");
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");
CREATE INDEX "transactions_venue_id_idx" ON "transactions"("venue_id");
CREATE INDEX "friend_requests_to_user_id_idx" ON "friend_requests"("to_user_id");
CREATE UNIQUE INDEX "friend_requests_from_user_id_to_user_id_key" ON "friend_requests"("from_user_id", "to_user_id");
CREATE INDEX "analytics_events_event_id_idx" ON "analytics_events"("event_id");
CREATE INDEX "analytics_events_venue_id_idx" ON "analytics_events"("venue_id");
CREATE INDEX "analytics_events_metric_idx" ON "analytics_events"("metric");
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events"("created_at");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- ─── Future: Live Venue Popularity ───────────────────────────────────────
CREATE TABLE "venue_popularity" (
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
CREATE TABLE "table_bookings" (
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

CREATE TABLE "table_booking_splits" (
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
CREATE TABLE "party_groups" (
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

CREATE TABLE "party_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "party_group_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "party_group_invitations" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "invitee_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    CONSTRAINT "party_group_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "party_group_events" (
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

-- Indexes for new tables
CREATE UNIQUE INDEX "venue_popularity_venue_id_event_id_key" ON "venue_popularity"("venue_id", "event_id");
CREATE INDEX "venue_popularity_venue_id_idx" ON "venue_popularity"("venue_id");
CREATE INDEX "venue_popularity_popularity_score_idx" ON "venue_popularity"("popularity_score");

CREATE INDEX "table_bookings_table_id_idx" ON "table_bookings"("table_id");
CREATE INDEX "table_bookings_organizer_user_id_idx" ON "table_bookings"("organizer_user_id");
CREATE INDEX "table_bookings_status_idx" ON "table_bookings"("status");

CREATE UNIQUE INDEX "table_booking_splits_booking_id_user_id_key" ON "table_booking_splits"("booking_id", "user_id");
CREATE INDEX "table_booking_splits_booking_id_idx" ON "table_booking_splits"("booking_id");
CREATE INDEX "table_booking_splits_user_id_idx" ON "table_booking_splits"("user_id");
CREATE INDEX "table_booking_splits_payment_status_idx" ON "table_booking_splits"("payment_status");

CREATE INDEX "party_groups_created_by_idx" ON "party_groups"("created_by");

CREATE UNIQUE INDEX "party_group_members_group_id_user_id_key" ON "party_group_members"("group_id", "user_id");
CREATE INDEX "party_group_members_group_id_idx" ON "party_group_members"("group_id");
CREATE INDEX "party_group_members_user_id_idx" ON "party_group_members"("user_id");

CREATE UNIQUE INDEX "party_group_invitations_group_id_invitee_id_key" ON "party_group_invitations"("group_id", "invitee_id");
CREATE INDEX "party_group_invitations_group_id_idx" ON "party_group_invitations"("group_id");
CREATE INDEX "party_group_invitations_invitee_id_idx" ON "party_group_invitations"("invitee_id");
CREATE INDEX "party_group_invitations_status_idx" ON "party_group_invitations"("status");

CREATE INDEX "party_group_events_group_id_idx" ON "party_group_events"("group_id");
CREATE INDEX "party_group_events_event_id_idx" ON "party_group_events"("event_id");

-- Foreign keys for new tables
ALTER TABLE "venue_popularity" ADD CONSTRAINT "venue_popularity_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_bookings" ADD CONSTRAINT "table_bookings_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_booking_splits" ADD CONSTRAINT "table_booking_splits_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "table_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_group_members" ADD CONSTRAINT "party_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "party_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_group_invitations" ADD CONSTRAINT "party_group_invitations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "party_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "party_group_events" ADD CONSTRAINT "party_group_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "party_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venues" ADD CONSTRAINT "venues_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_blocked_users" ADD CONSTRAINT "venue_blocked_users_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tables" ADD CONSTRAINT "tables_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Compliance Documents + Admin Reviewers (Issue 2) ─────────────────────
DO $$
BEGIN
  CREATE TYPE "ComplianceDocumentType" AS ENUM (
    'LIQUOR_LICENCE',
    'BUSINESS_REGISTRATION',
    'HEALTH_CERTIFICATE',
    'TAX_CLEARANCE',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ComplianceDocumentStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "compliance_documents" (
  "id" TEXT NOT NULL,
  "venue_id" TEXT NOT NULL,
  "document_type" "ComplianceDocumentType" NOT NULL,
  "file_url" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ComplianceDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "rejection_reason" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by" TEXT,

  CONSTRAINT "compliance_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "compliance_documents_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "compliance_documents_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "admin_reviewers" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "added_by_user_id" TEXT NOT NULL,

  CONSTRAINT "admin_reviewers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_reviewers_email_key" UNIQUE ("email"),
  CONSTRAINT "admin_reviewers_added_by_user_id_fkey"
    FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "compliance_documents_venue_id_idx" ON "compliance_documents"("venue_id");
CREATE INDEX IF NOT EXISTS "compliance_documents_status_idx" ON "compliance_documents"("status");
CREATE INDEX IF NOT EXISTS "compliance_documents_document_type_idx" ON "compliance_documents"("document_type");

CREATE INDEX IF NOT EXISTS "admin_reviewers_is_active_idx" ON "admin_reviewers"("is_active");
