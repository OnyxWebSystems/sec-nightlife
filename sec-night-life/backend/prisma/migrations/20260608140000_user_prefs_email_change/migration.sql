-- Email change OTP fields on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_change_current_otp_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_change_current_otp_expiry" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_change_current_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_change_new_email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_change_new_otp_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_change_new_otp_expiry" TIMESTAMP(3);

-- User profile JSON preferences
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "notification_prefs" JSONB;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "privacy_settings" JSONB;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "app_preferences" JSONB;
