-- Expand reporting for trust & safety workflows
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportCategory') THEN
    CREATE TYPE "ReportCategory" AS ENUM (
      'fraud',
      'fake_event',
      'gbv_or_harassment',
      'scam_or_payment_issue',
      'impersonation',
      'hate_or_abuse',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReportPriority') THEN
    CREATE TYPE "ReportPriority" AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
END
$$;

ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE "ReportStatus" ADD VALUE IF NOT EXISTS 'action_taken';

ALTER TABLE "reports"
  ADD COLUMN IF NOT EXISTS "category" "ReportCategory" NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "priority" "ReportPriority" NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS "evidence_urls" JSONB,
  ADD COLUMN IF NOT EXISTS "assigned_to" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_note" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "reports_category_idx" ON "reports"("category");
CREATE INDEX IF NOT EXISTS "reports_priority_idx" ON "reports"("priority");
CREATE INDEX IF NOT EXISTS "reports_assigned_to_idx" ON "reports"("assigned_to");
