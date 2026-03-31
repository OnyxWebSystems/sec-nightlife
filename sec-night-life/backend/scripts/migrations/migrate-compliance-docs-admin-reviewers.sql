-- Migration: Compliance Documents + Admin Reviewers (Issue 2)
-- Idempotent: safe to run multiple times.

-- ─── Enums ──────────────────────────────────────────────────────────────
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

-- ─── Compliance documents ──────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS "compliance_documents_venue_id_idx" ON "compliance_documents"("venue_id");
CREATE INDEX IF NOT EXISTS "compliance_documents_status_idx" ON "compliance_documents"("status");
CREATE INDEX IF NOT EXISTS "compliance_documents_document_type_idx" ON "compliance_documents"("document_type");

-- ─── Admin reviewers ───────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS "admin_reviewers_is_active_idx" ON "admin_reviewers"("is_active");

