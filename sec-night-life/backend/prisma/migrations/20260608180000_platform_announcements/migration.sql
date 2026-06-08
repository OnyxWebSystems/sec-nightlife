CREATE TABLE "platform_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "cta_url" TEXT,
    "cta_label" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "removed_by_id" TEXT,
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_announcements_is_active_created_at_idx"
  ON "platform_announcements"("is_active", "created_at");

ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_announcements" ADD CONSTRAINT "platform_announcements_removed_by_id_fkey"
  FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
