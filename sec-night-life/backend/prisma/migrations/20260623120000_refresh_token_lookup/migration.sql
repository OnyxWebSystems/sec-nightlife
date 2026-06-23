-- Fast lookup for refresh token rotation (avoids scanning arbitrary token rows).
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "token_lookup" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_lookup_key" ON "refresh_tokens"("token_lookup");
