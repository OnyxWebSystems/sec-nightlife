-- AlterEnum: add PENDING to AttendeeStatus (run once; ignore if already applied)
ALTER TYPE "AttendeeStatus" ADD VALUE 'PENDING';

-- Hosted table group chats (separate from event GroupChat)
CREATE TABLE IF NOT EXISTS "hosted_table_group_chats" (
    "id" TEXT NOT NULL,
    "hosted_table_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hosted_table_group_chats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hosted_table_group_chats_hosted_table_id_key" ON "hosted_table_group_chats"("hosted_table_id");
CREATE INDEX IF NOT EXISTS "hosted_table_group_chats_last_message_at_idx" ON "hosted_table_group_chats"("last_message_at");

ALTER TABLE "hosted_table_group_chats"
  ADD CONSTRAINT "hosted_table_group_chats_hosted_table_id_fkey"
  FOREIGN KEY ("hosted_table_id") REFERENCES "hosted_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "hosted_table_group_chat_members" (
    "id" TEXT NOT NULL,
    "hosted_table_group_chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3),
    CONSTRAINT "hosted_table_group_chat_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hosted_table_group_chat_members_hosted_table_group_chat_id_user_id_key"
  ON "hosted_table_group_chat_members"("hosted_table_group_chat_id", "user_id");
CREATE INDEX IF NOT EXISTS "hosted_table_group_chat_members_hosted_table_group_chat_id_idx"
  ON "hosted_table_group_chat_members"("hosted_table_group_chat_id");
CREATE INDEX IF NOT EXISTS "hosted_table_group_chat_members_user_id_idx"
  ON "hosted_table_group_chat_members"("user_id");

ALTER TABLE "hosted_table_group_chat_members"
  ADD CONSTRAINT "hosted_table_group_chat_members_hosted_table_group_chat_id_fkey"
  FOREIGN KEY ("hosted_table_group_chat_id") REFERENCES "hosted_table_group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hosted_table_group_chat_members"
  ADD CONSTRAINT "hosted_table_group_chat_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "hosted_table_group_chat_messages" (
    "id" TEXT NOT NULL,
    "hosted_table_group_chat_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hosted_table_group_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "hosted_table_group_chat_messages_hosted_table_group_chat_id_sent_at_idx"
  ON "hosted_table_group_chat_messages"("hosted_table_group_chat_id", "sent_at");

ALTER TABLE "hosted_table_group_chat_messages"
  ADD CONSTRAINT "hosted_table_group_chat_messages_hosted_table_group_chat_id_fkey"
  FOREIGN KEY ("hosted_table_group_chat_id") REFERENCES "hosted_table_group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hosted_table_group_chat_messages"
  ADD CONSTRAINT "hosted_table_group_chat_messages_sender_user_id_fkey"
  FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
