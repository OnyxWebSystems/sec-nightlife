-- VenueMessageGroup avatar
ALTER TABLE "venue_message_groups" ADD COLUMN "avatar_url" TEXT;

-- Message reply columns
ALTER TABLE "direct_messages" ADD COLUMN "reply_to_message_id" TEXT;
ALTER TABLE "group_chat_messages" ADD COLUMN "reply_to_message_id" TEXT;
ALTER TABLE "hosted_table_group_chat_messages" ADD COLUMN "reply_to_message_id" TEXT;
ALTER TABLE "venue_table_messages" ADD COLUMN "reply_to_message_id" TEXT;
ALTER TABLE "venue_message_group_messages" ADD COLUMN "reply_to_message_id" TEXT;
ALTER TABLE "promoter_venue_messages" ADD COLUMN "reply_to_message_id" TEXT;
ALTER TABLE "job_messages" ADD COLUMN "reply_to_message_id" TEXT;

ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "direct_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "group_chat_messages" ADD CONSTRAINT "group_chat_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "group_chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hosted_table_group_chat_messages" ADD CONSTRAINT "hosted_table_group_chat_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "hosted_table_group_chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_table_messages" ADD CONSTRAINT "venue_table_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "venue_table_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_message_group_messages" ADD CONSTRAINT "venue_message_group_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "venue_message_group_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "promoter_venue_messages" ADD CONSTRAINT "promoter_venue_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "promoter_venue_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_messages" ADD CONSTRAINT "job_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "job_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
