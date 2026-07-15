-- Launch hardening: payout ledger statuses, uniqueness, indexes

DO $$ BEGIN
  ALTER TYPE "PayoutLedgerStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "PayoutLedgerStatus" ADD VALUE IF NOT EXISTS 'REFUNDED_MANUAL';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Dedupe payment_reference keeping newest row before unique constraint
DELETE FROM "payout_ledgers" a
USING "payout_ledgers" b
WHERE a.payment_reference = b.payment_reference
  AND a.created_at < b.created_at;

DELETE FROM "payout_ledgers" a
USING "payout_ledgers" b
WHERE a.payment_reference = b.payment_reference
  AND a.id < b.id;

DROP INDEX IF EXISTS "payout_ledgers_payment_reference_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "payout_ledgers_payment_reference_key"
  ON "payout_ledgers"("payment_reference");

CREATE INDEX IF NOT EXISTS "payout_ledgers_status_idx" ON "payout_ledgers"("status");
CREATE INDEX IF NOT EXISTS "payout_ledgers_created_at_idx" ON "payout_ledgers"("created_at");

-- Soft-retain refund requests when users delete accounts
ALTER TABLE "refund_requests" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "refund_requests" DROP CONSTRAINT IF EXISTS "refund_requests_user_id_fkey";
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
