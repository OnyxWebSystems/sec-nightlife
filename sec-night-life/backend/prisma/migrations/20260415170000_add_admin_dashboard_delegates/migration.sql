CREATE TABLE "admin_dashboard_delegates" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "added_by_user_id" TEXT NOT NULL,
  CONSTRAINT "admin_dashboard_delegates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_dashboard_delegates_email_key" ON "admin_dashboard_delegates"("email");
CREATE INDEX "admin_dashboard_delegates_is_active_idx" ON "admin_dashboard_delegates"("is_active");

ALTER TABLE "admin_dashboard_delegates"
  ADD CONSTRAINT "admin_dashboard_delegates_added_by_user_id_fkey"
  FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
