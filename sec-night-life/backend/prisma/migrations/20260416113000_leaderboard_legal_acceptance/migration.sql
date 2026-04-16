-- Add leaderboard moderation fields to user_profiles
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "leaderboard_hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "leaderboard_hidden_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "leaderboard_hidden_until" TIMESTAMP(3);

-- Legal document acceptances
DO $$
BEGIN
  CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'PROMOTER_CODE_OF_CONDUCT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "legal_document_acceptances" (
  "id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "document_type" "LegalDocumentType" NOT NULL,
  "version" TEXT NOT NULL,
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" TEXT,
  "user_agent" TEXT,
  CONSTRAINT "legal_document_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "legal_document_acceptances_user_id_document_type_accepted_at_idx"
  ON "legal_document_acceptances"("user_id", "document_type", "accepted_at");

CREATE INDEX IF NOT EXISTS "legal_document_acceptances_document_type_version_idx"
  ON "legal_document_acceptances"("document_type", "version");

DO $$
BEGIN
  ALTER TABLE "legal_document_acceptances"
    ADD CONSTRAINT "legal_document_acceptances_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

