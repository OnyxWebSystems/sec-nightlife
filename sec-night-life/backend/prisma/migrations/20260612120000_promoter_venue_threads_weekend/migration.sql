-- Promoter venue messaging threads + weekly weekend reminder dedupe
CREATE TABLE "promoter_venue_threads" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "promoter_user_id" TEXT NOT NULL,
    "job_application_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "promoter_hidden_at" TIMESTAMP(3),
    "venue_hidden_at" TIMESTAMP(3),

    CONSTRAINT "promoter_venue_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promoter_venue_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "sender_user_id" TEXT,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "event_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "promoter_venue_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "weekend_reminder_sent" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekend_reminder_sent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promoter_venue_threads_venue_id_promoter_user_id_key" ON "promoter_venue_threads"("venue_id", "promoter_user_id");
CREATE INDEX "promoter_venue_threads_promoter_user_id_idx" ON "promoter_venue_threads"("promoter_user_id");
CREATE INDEX "promoter_venue_messages_thread_id_sent_at_idx" ON "promoter_venue_messages"("thread_id", "sent_at");
CREATE UNIQUE INDEX "weekend_reminder_sent_user_id_week_key_key" ON "weekend_reminder_sent"("user_id", "week_key");

ALTER TABLE "promoter_venue_threads" ADD CONSTRAINT "promoter_venue_threads_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promoter_venue_threads" ADD CONSTRAINT "promoter_venue_threads_promoter_user_id_fkey" FOREIGN KEY ("promoter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promoter_venue_messages" ADD CONSTRAINT "promoter_venue_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "promoter_venue_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promoter_venue_messages" ADD CONSTRAINT "promoter_venue_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "weekend_reminder_sent" ADD CONSTRAINT "weekend_reminder_sent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
