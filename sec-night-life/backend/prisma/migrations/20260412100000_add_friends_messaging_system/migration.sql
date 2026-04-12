-- Friends & messaging system

CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED', 'DECLINED');

CREATE TYPE "NotificationType" AS ENUM (
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  'DIRECT_MESSAGE',
  'GROUP_MESSAGE',
  'EVENT_JOINED',
  'TABLE_JOINED',
  'JOIN_REQUEST_ACCEPTED'
);

CREATE TYPE "FriendActivityType" AS ENUM (
  'JOINED_EVENT',
  'JOINED_TABLE',
  'HOSTED_TABLE',
  'INTERACTED_PROMOTION'
);

ALTER TABLE "users" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

CREATE INDEX "users_username_idx" ON "users"("username");

CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "participant_a_id" TEXT NOT NULL,
    "participant_b_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "direct_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_chats" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_chats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_chat_members" (
    "id" TEXT NOT NULL,
    "group_chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3),

    CONSTRAINT "group_chat_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_chat_messages" (
    "id" TEXT NOT NULL,
    "group_chat_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "friend_activities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "activity_type" "FriendActivityType" NOT NULL,
    "reference_id" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "friendships_requester_id_idx" ON "friendships"("requester_id");

CREATE INDEX "friendships_receiver_id_idx" ON "friendships"("receiver_id");

CREATE INDEX "friendships_status_idx" ON "friendships"("status");

CREATE UNIQUE INDEX "friendships_requester_id_receiver_id_key" ON "friendships"("requester_id", "receiver_id");

CREATE INDEX "conversations_participant_a_id_idx" ON "conversations"("participant_a_id");

CREATE INDEX "conversations_participant_b_id_idx" ON "conversations"("participant_b_id");

CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

CREATE UNIQUE INDEX "conversations_participant_a_id_participant_b_id_key" ON "conversations"("participant_a_id", "participant_b_id");

CREATE INDEX "direct_messages_conversation_id_sent_at_idx" ON "direct_messages"("conversation_id", "sent_at");

CREATE UNIQUE INDEX "group_chats_event_id_key" ON "group_chats"("event_id");

CREATE INDEX "group_chats_last_message_at_idx" ON "group_chats"("last_message_at");

CREATE INDEX "group_chat_members_group_chat_id_idx" ON "group_chat_members"("group_chat_id");

CREATE INDEX "group_chat_members_user_id_idx" ON "group_chat_members"("user_id");

CREATE UNIQUE INDEX "group_chat_members_group_chat_id_user_id_key" ON "group_chat_members"("group_chat_id", "user_id");

CREATE INDEX "group_chat_messages_group_chat_id_sent_at_idx" ON "group_chat_messages"("group_chat_id", "sent_at");

CREATE INDEX "in_app_notifications_user_id_read_idx" ON "in_app_notifications"("user_id", "read");

CREATE INDEX "in_app_notifications_user_id_created_at_idx" ON "in_app_notifications"("user_id", "created_at");

CREATE INDEX "friend_activities_user_id_created_at_idx" ON "friend_activities"("user_id", "created_at");

ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "friendships" ADD CONSTRAINT "friendships_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_a_id_fkey" FOREIGN KEY ("participant_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_b_id_fkey" FOREIGN KEY ("participant_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_chats" ADD CONSTRAINT "group_chats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_chat_members" ADD CONSTRAINT "group_chat_members_group_chat_id_fkey" FOREIGN KEY ("group_chat_id") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_chat_members" ADD CONSTRAINT "group_chat_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_chat_messages" ADD CONSTRAINT "group_chat_messages_group_chat_id_fkey" FOREIGN KEY ("group_chat_id") REFERENCES "group_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_chat_messages" ADD CONSTRAINT "group_chat_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "friend_activities" ADD CONSTRAINT "friend_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill username from user_profiles (lowercase) where still null on users
UPDATE "users" u
SET "username" = LOWER(TRIM(p.username))
FROM "user_profiles" p
WHERE p.user_id = u.id
  AND p.username IS NOT NULL
  AND TRIM(p.username) <> ''
  AND u.username IS NULL;
