-- Run after migrate-super-admin-role.sql
-- Replace the placeholder email before executing.
-- Do not commit a real personal email address into source control.

UPDATE "users"
SET "role" = 'SUPER_ADMIN'
WHERE lower("email") = lower('<SUPER_ADMIN_EMAIL>');
