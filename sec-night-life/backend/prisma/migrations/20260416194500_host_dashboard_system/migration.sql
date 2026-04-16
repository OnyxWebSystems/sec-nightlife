-- CreateEnum
CREATE TYPE "HousePartyStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HostedTableStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FULL', 'CLOSED');

-- CreateEnum
CREATE TYPE "TableSourceType" AS ENUM ('IN_APP_EVENT', 'EXTERNAL_VENUE');

-- CreateEnum
CREATE TYPE "AttendeeStatus" AS ENUM ('GOING', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "house_parties" (
    "id" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "cover_image_url" TEXT,
    "cover_image_public_id" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "has_entrance_fee" BOOLEAN NOT NULL DEFAULT false,
    "entrance_fee_amount" DOUBLE PRECISION,
    "entrance_fee_note" TEXT,
    "free_entry_group" TEXT,
    "guest_quantity" INTEGER NOT NULL,
    "spots_remaining" INTEGER NOT NULL,
    "status" "HousePartyStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "publish_paystack_ref" TEXT,
    "boosted" BOOLEAN NOT NULL DEFAULT false,
    "boosted_at" TIMESTAMP(3),
    "boost_expires_at" TIMESTAMP(3),
    "boost_paystack_ref" TEXT,
    "boost_impressions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "house_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_party_attendees" (
    "id" TEXT NOT NULL,
    "house_party_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "AttendeeStatus" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "house_party_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hosted_tables" (
    "id" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "table_type" "TableSourceType" NOT NULL,
    "event_id" TEXT,
    "venue_name" TEXT NOT NULL,
    "venue_address" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "event_time" TEXT NOT NULL,
    "drink_preferences" TEXT,
    "desired_company" TEXT,
    "guest_quantity" INTEGER NOT NULL,
    "spots_remaining" INTEGER NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "status" "HostedTableStatus" NOT NULL DEFAULT 'ACTIVE',
    "boosted" BOOLEAN NOT NULL DEFAULT false,
    "boosted_at" TIMESTAMP(3),
    "boost_expires_at" TIMESTAMP(3),
    "boost_paystack_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hosted_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hosted_table_members" (
    "id" TEXT NOT NULL,
    "hosted_table_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "AttendeeStatus" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hosted_table_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_invites" (
    "id" TEXT NOT NULL,
    "hosted_table_id" TEXT NOT NULL,
    "inviter_user_id" TEXT NOT NULL,
    "invitee_user_id" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "table_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_party_jobs" (
    "id" TEXT NOT NULL,
    "house_party_id" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "job_type" "JobType" NOT NULL,
    "compensation_type" "CompensationType" NOT NULL,
    "compensation_amount" DOUBLE PRECISION,
    "compensation_per" "CompensationPer" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "total_spots" INTEGER NOT NULL DEFAULT 1,
    "filled_spots" INTEGER NOT NULL DEFAULT 0,
    "closing_date" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "house_party_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_party_job_applications" (
    "id" TEXT NOT NULL,
    "house_party_job_id" TEXT NOT NULL,
    "applicant_user_id" TEXT NOT NULL,
    "cover_message" TEXT NOT NULL,
    "cv_url" TEXT,
    "cv_file_name" TEXT,
    "portfolio_url" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "house_party_job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_party_job_messages" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "house_party_job_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "house_parties_host_user_id_idx" ON "house_parties"("host_user_id");
CREATE INDEX "house_parties_status_idx" ON "house_parties"("status");
CREATE INDEX "house_parties_start_time_idx" ON "house_parties"("start_time");
CREATE INDEX "house_party_attendees_house_party_id_idx" ON "house_party_attendees"("house_party_id");
CREATE INDEX "house_party_attendees_user_id_idx" ON "house_party_attendees"("user_id");
CREATE UNIQUE INDEX "house_party_attendees_house_party_id_user_id_key" ON "house_party_attendees"("house_party_id", "user_id");
CREATE INDEX "hosted_tables_host_user_id_idx" ON "hosted_tables"("host_user_id");
CREATE INDEX "hosted_tables_status_idx" ON "hosted_tables"("status");
CREATE INDEX "hosted_tables_event_date_idx" ON "hosted_tables"("event_date");
CREATE INDEX "hosted_table_members_hosted_table_id_idx" ON "hosted_table_members"("hosted_table_id");
CREATE INDEX "hosted_table_members_user_id_idx" ON "hosted_table_members"("user_id");
CREATE UNIQUE INDEX "hosted_table_members_hosted_table_id_user_id_key" ON "hosted_table_members"("hosted_table_id", "user_id");
CREATE INDEX "table_invites_invitee_user_id_idx" ON "table_invites"("invitee_user_id");
CREATE UNIQUE INDEX "table_invites_hosted_table_id_invitee_user_id_key" ON "table_invites"("hosted_table_id", "invitee_user_id");
CREATE INDEX "house_party_jobs_house_party_id_idx" ON "house_party_jobs"("house_party_id");
CREATE INDEX "house_party_jobs_host_user_id_idx" ON "house_party_jobs"("host_user_id");
CREATE INDEX "house_party_jobs_status_idx" ON "house_party_jobs"("status");
CREATE INDEX "house_party_job_applications_house_party_job_id_idx" ON "house_party_job_applications"("house_party_job_id");
CREATE INDEX "house_party_job_applications_applicant_user_id_idx" ON "house_party_job_applications"("applicant_user_id");
CREATE INDEX "house_party_job_applications_status_idx" ON "house_party_job_applications"("status");
CREATE UNIQUE INDEX "house_party_job_applications_house_party_job_id_applicant_u_key" ON "house_party_job_applications"("house_party_job_id", "applicant_user_id");
CREATE INDEX "house_party_job_messages_application_id_idx" ON "house_party_job_messages"("application_id");
CREATE INDEX "house_party_job_messages_sender_user_id_idx" ON "house_party_job_messages"("sender_user_id");
CREATE INDEX "house_party_job_messages_sent_at_idx" ON "house_party_job_messages"("sent_at");

ALTER TABLE "house_parties" ADD CONSTRAINT "house_parties_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "house_party_attendees" ADD CONSTRAINT "house_party_attendees_house_party_id_fkey" FOREIGN KEY ("house_party_id") REFERENCES "house_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "house_party_attendees" ADD CONSTRAINT "house_party_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hosted_tables" ADD CONSTRAINT "hosted_tables_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hosted_tables" ADD CONSTRAINT "hosted_tables_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hosted_table_members" ADD CONSTRAINT "hosted_table_members_hosted_table_id_fkey" FOREIGN KEY ("hosted_table_id") REFERENCES "hosted_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hosted_table_members" ADD CONSTRAINT "hosted_table_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_invites" ADD CONSTRAINT "table_invites_hosted_table_id_fkey" FOREIGN KEY ("hosted_table_id") REFERENCES "hosted_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_invites" ADD CONSTRAINT "table_invites_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "table_invites" ADD CONSTRAINT "table_invites_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "house_party_jobs" ADD CONSTRAINT "house_party_jobs_house_party_id_fkey" FOREIGN KEY ("house_party_id") REFERENCES "house_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "house_party_jobs" ADD CONSTRAINT "house_party_jobs_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "house_party_job_applications" ADD CONSTRAINT "house_party_job_applications_house_party_job_id_fkey" FOREIGN KEY ("house_party_job_id") REFERENCES "house_party_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "house_party_job_applications" ADD CONSTRAINT "house_party_job_applications_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "house_party_job_messages" ADD CONSTRAINT "house_party_job_messages_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "house_party_job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "house_party_job_messages" ADD CONSTRAINT "house_party_job_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
