-- CreateEnum
CREATE TYPE "EventFormat" AS ENUM ('TABLE_HOSTING', 'TICKETING_ONLY');

-- AlterTable
ALTER TABLE "events" ADD COLUMN "event_format" "EventFormat" NOT NULL DEFAULT 'TABLE_HOSTING';
