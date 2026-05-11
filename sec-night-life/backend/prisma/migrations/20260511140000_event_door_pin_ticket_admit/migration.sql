-- AlterTable
ALTER TABLE "events" ADD COLUMN "door_check_pin_hash" TEXT;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "admitted_at" TIMESTAMP(3),
ADD COLUMN "admitted_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "tickets_admitted_at_idx" ON "tickets"("admitted_at");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_admitted_by_user_id_fkey" FOREIGN KEY ("admitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
