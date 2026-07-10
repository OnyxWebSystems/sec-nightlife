-- CreateEnum
CREATE TYPE "HostedListingSurface" AS ENUM ('TABLE', 'EVENT');

-- AlterTable
ALTER TABLE "hosted_tables" ADD COLUMN "listing_surface" "HostedListingSurface" NOT NULL DEFAULT 'TABLE';
