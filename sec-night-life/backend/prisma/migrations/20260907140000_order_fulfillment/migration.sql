-- CreateEnum
CREATE TYPE "OrderFulfillmentKind" AS ENUM ('TICKET_MENU', 'TABLE_MENU', 'MIN_SPEND', 'ENTRANCE_MENU');

-- CreateTable
CREATE TABLE "order_fulfillments" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "paystack_reference" TEXT NOT NULL,
    "kind" "OrderFulfillmentKind" NOT NULL,
    "fulfilled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_by_user_id" TEXT NOT NULL,

    CONSTRAINT "order_fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_fulfillments_paystack_reference_key" ON "order_fulfillments"("paystack_reference");

-- CreateIndex
CREATE INDEX "order_fulfillments_venue_id_idx" ON "order_fulfillments"("venue_id");

-- CreateIndex
CREATE INDEX "order_fulfillments_user_id_idx" ON "order_fulfillments"("user_id");

-- CreateIndex
CREATE INDEX "order_fulfillments_fulfilled_by_user_id_idx" ON "order_fulfillments"("fulfilled_by_user_id");

-- AddForeignKey
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_fulfillments" ADD CONSTRAINT "order_fulfillments_fulfilled_by_user_id_fkey" FOREIGN KEY ("fulfilled_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
