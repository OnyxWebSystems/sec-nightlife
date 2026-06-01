-- Venue table controlled messaging (button templates only)
CREATE TABLE IF NOT EXISTS "venue_table_threads" (
    "id" TEXT NOT NULL,
    "venue_table_member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_table_threads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "venue_table_threads_venue_table_member_id_key" ON "venue_table_threads"("venue_table_member_id");

CREATE TABLE IF NOT EXISTS "venue_table_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "venue_table_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "venue_table_messages_thread_id_idx" ON "venue_table_messages"("thread_id");
CREATE INDEX IF NOT EXISTS "venue_table_messages_sender_user_id_idx" ON "venue_table_messages"("sender_user_id");

ALTER TABLE "venue_table_threads" ADD CONSTRAINT "venue_table_threads_venue_table_member_id_fkey" FOREIGN KEY ("venue_table_member_id") REFERENCES "venue_table_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_table_messages" ADD CONSTRAINT "venue_table_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "venue_table_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_table_messages" ADD CONSTRAINT "venue_table_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
