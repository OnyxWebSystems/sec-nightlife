-- CreateEnum
CREATE TYPE "VenueMessageGroupRole" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "venue_table_threads" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "venue_message_groups" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "venue_message_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "venue_message_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "VenueMessageGroupRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_message_group_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "venue_message_group_messages" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "venue_message_group_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "venue_staff_assignments" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "venue_staff_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "venue_message_group_members_group_id_user_id_key" ON "venue_message_group_members"("group_id", "user_id");
CREATE INDEX IF NOT EXISTS "venue_message_groups_venue_id_idx" ON "venue_message_groups"("venue_id");
CREATE INDEX IF NOT EXISTS "venue_message_group_messages_group_id_created_at_idx" ON "venue_message_group_messages"("group_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "venue_staff_assignments_venue_id_user_id_key" ON "venue_staff_assignments"("venue_id", "user_id");
CREATE INDEX IF NOT EXISTS "venue_staff_assignments_user_id_idx" ON "venue_staff_assignments"("user_id");

ALTER TABLE "venue_message_groups" ADD CONSTRAINT "venue_message_groups_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_message_groups" ADD CONSTRAINT "venue_message_groups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_message_group_members" ADD CONSTRAINT "venue_message_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "venue_message_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_message_group_members" ADD CONSTRAINT "venue_message_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_message_group_messages" ADD CONSTRAINT "venue_message_group_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "venue_message_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_message_group_messages" ADD CONSTRAINT "venue_message_group_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_staff_assignments" ADD CONSTRAINT "venue_staff_assignments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_staff_assignments" ADD CONSTRAINT "venue_staff_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_staff_assignments" ADD CONSTRAINT "venue_staff_assignments_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
