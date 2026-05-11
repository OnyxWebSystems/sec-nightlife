-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "holder_display_name" TEXT,
ADD COLUMN     "table_specs_summary" TEXT,
ADD COLUMN     "event_starts_at" TIMESTAMP(3),
ADD COLUMN     "hidden_from_history_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tickets_event_starts_at_idx" ON "tickets"("event_starts_at");
