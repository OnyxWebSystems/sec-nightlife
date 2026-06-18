-- AlterTable
ALTER TABLE "events" ADD COLUMN "event_code" TEXT;

-- AlterTable
ALTER TABLE "venue_tables" ADD COLUMN "table_session_number" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "events_venue_id_event_code_key" ON "events"("venue_id", "event_code");
