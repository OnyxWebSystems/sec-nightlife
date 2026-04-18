-- AlterEnum (idempotent)
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'EVENT_INTEREST_REMINDER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "interested_events" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE IF NOT EXISTS "event_interest_reminders_sent" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_interest_reminders_sent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_interest_reminders_sent_user_id_event_id_key" ON "event_interest_reminders_sent"("user_id", "event_id");
CREATE INDEX IF NOT EXISTS "event_interest_reminders_sent_event_id_idx" ON "event_interest_reminders_sent"("event_id");

ALTER TABLE "event_interest_reminders_sent" ADD CONSTRAINT "event_interest_reminders_sent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_interest_reminders_sent" ADD CONSTRAINT "event_interest_reminders_sent_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
