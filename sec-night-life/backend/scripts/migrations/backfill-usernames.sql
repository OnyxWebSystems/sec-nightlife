-- One-time backfill: assign deterministic usernames before making User.username NOT NULL.
-- Idempotent: only touches rows where username is missing or blank; safe to re-run.

UPDATE users
SET username = 'user_' || SUBSTRING(id::text, 1, 8)
WHERE username IS NULL
   OR TRIM(username) = '';
