-- CreateEnum
CREATE TYPE "VenueTableMemberRole" AS ENUM ('HOST', 'GUEST');

-- AlterTable
ALTER TABLE "venue_tables" ADD COLUMN "hosted_table_id" TEXT,
ADD COLUMN "host_user_id" TEXT;

-- AlterTable
ALTER TABLE "venue_table_members" ADD COLUMN "member_role" "VenueTableMemberRole" NOT NULL DEFAULT 'GUEST';

-- CreateIndex
CREATE UNIQUE INDEX "venue_tables_hosted_table_id_key" ON "venue_tables"("hosted_table_id");

-- CreateIndex
CREATE INDEX "venue_tables_host_user_id_idx" ON "venue_tables"("host_user_id");

-- AddForeignKey
ALTER TABLE "venue_tables" ADD CONSTRAINT "venue_tables_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
