-- Table history & Sec Wallet

CREATE TYPE "TableHistoryRole" AS ENUM ('HOST', 'JOINED');
CREATE TYPE "SecWalletOwnerType" AS ENUM ('USER', 'VENUE');

CREATE TABLE "user_table_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "table_id" TEXT,
    "hosted_table_id" TEXT,
    "venue_table_id" TEXT,
    "event_id" TEXT,
    "role" "TableHistoryRole" NOT NULL,
    "table_name" TEXT NOT NULL,
    "event_title" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden_at" TIMESTAMP(3),

    CONSTRAINT "user_table_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_table_history_user_id_hidden_at_occurred_at_idx" ON "user_table_history"("user_id", "hidden_at", "occurred_at");

ALTER TABLE "user_table_history" ADD CONSTRAINT "user_table_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sec_wallets" (
    "id" TEXT NOT NULL,
    "wallet_code" TEXT NOT NULL,
    "owner_type" "SecWalletOwnerType" NOT NULL,
    "user_id" TEXT,
    "venue_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sec_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sec_wallets_wallet_code_key" ON "sec_wallets"("wallet_code");
CREATE UNIQUE INDEX "sec_wallets_user_id_key" ON "sec_wallets"("user_id");
CREATE UNIQUE INDEX "sec_wallets_venue_id_key" ON "sec_wallets"("venue_id");
CREATE INDEX "sec_wallets_wallet_code_idx" ON "sec_wallets"("wallet_code");

ALTER TABLE "sec_wallets" ADD CONSTRAINT "sec_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sec_wallets" ADD CONSTRAINT "sec_wallets_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wallet_recipients" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "target_wallet_id" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_recipients_venue_id_target_wallet_id_key" ON "wallet_recipients"("venue_id", "target_wallet_id");
CREATE INDEX "wallet_recipients_venue_id_idx" ON "wallet_recipients"("venue_id");

ALTER TABLE "wallet_recipients" ADD CONSTRAINT "wallet_recipients_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_recipients" ADD CONSTRAINT "wallet_recipients_target_wallet_id_fkey" FOREIGN KEY ("target_wallet_id") REFERENCES "sec_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "wallet_lookup_logs" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "looked_up_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_lookup_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_lookup_logs_venue_id_created_at_idx" ON "wallet_lookup_logs"("venue_id", "created_at");

ALTER TABLE "wallet_lookup_logs" ADD CONSTRAINT "wallet_lookup_logs_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_lookup_logs" ADD CONSTRAINT "wallet_lookup_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
