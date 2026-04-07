CREATE TYPE "JobType" AS ENUM ('FULL_TIME','PART_TIME','ONCE_OFF','CONTRACT');
CREATE TYPE "CompensationType" AS ENUM ('FIXED','NEGOTIABLE','UNPAID_TRIAL');
CREATE TYPE "CompensationPer" AS ENUM ('HOUR','MONTH','COMMISSION','ONCE_OFF');
CREATE TYPE "JobStatus" AS ENUM ('OPEN','CLOSED','FILLED');
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING','SHORTLISTED','REJECTED','HIRED');

CREATE TABLE "job_postings" (
  "id" TEXT PRIMARY KEY,
  "venue_id" TEXT NOT NULL,
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
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "job_applications" (
  "id" TEXT PRIMARY KEY,
  "job_posting_id" TEXT NOT NULL,
  "applicant_user_id" TEXT NOT NULL,
  "cover_message" TEXT NOT NULL,
  "cv_url" TEXT,
  "cv_file_name" TEXT,
  "portfolio_url" TEXT,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "job_messages" (
  "id" TEXT PRIMARY KEY,
  "application_id" TEXT NOT NULL,
  "job_posting_id" TEXT NOT NULL,
  "sender_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMP(3)
);

ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_posting_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_job_posting_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "job_applications_job_posting_id_applicant_user_id_key" ON "job_applications"("job_posting_id","applicant_user_id");
CREATE INDEX "job_postings_venue_id_idx" ON "job_postings"("venue_id");
CREATE INDEX "job_postings_status_idx" ON "job_postings"("status");
CREATE INDEX "job_postings_created_at_idx" ON "job_postings"("created_at");
CREATE INDEX "job_applications_job_posting_id_idx" ON "job_applications"("job_posting_id");
CREATE INDEX "job_applications_applicant_user_id_idx" ON "job_applications"("applicant_user_id");
CREATE INDEX "job_applications_status_idx" ON "job_applications"("status");
CREATE INDEX "job_messages_application_id_idx" ON "job_messages"("application_id");
CREATE INDEX "job_messages_job_posting_id_idx" ON "job_messages"("job_posting_id");
CREATE INDEX "job_messages_sender_user_id_idx" ON "job_messages"("sender_user_id");
CREATE INDEX "job_messages_sent_at_idx" ON "job_messages"("sent_at");
CREATE INDEX "job_messages_read_at_idx" ON "job_messages"("read_at");
