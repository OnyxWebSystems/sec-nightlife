-- Login email OTP (2FA at sign-in)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_otp_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_otp_expiry" TIMESTAMP(3);
