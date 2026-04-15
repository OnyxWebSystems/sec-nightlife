-- AlterEnum (PostgreSQL: new values appended; run once per deploy)
ALTER TYPE "NotificationType" ADD VALUE 'TABLE_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'IDENTITY_VERIFICATION_REMINDER';
