-- These columns were added to the consolidated initial schema after some
-- development databases had already recorded 0000_init.sql as applied.
ALTER TABLE "kicks" ADD COLUMN IF NOT EXISTS "discord_audit_log_id" text;
ALTER TABLE "bans" ADD COLUMN IF NOT EXISTS "discord_audit_log_id" text;
ALTER TABLE "timeouts" ADD COLUMN IF NOT EXISTS "discord_audit_log_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "kicks_discord_audit_log_id_unique"
    ON "kicks" ("discord_audit_log_id");
CREATE UNIQUE INDEX IF NOT EXISTS "bans_discord_audit_log_id_unique"
    ON "bans" ("discord_audit_log_id");
CREATE UNIQUE INDEX IF NOT EXISTS "timeouts_discord_audit_log_id_unique"
    ON "timeouts" ("discord_audit_log_id");
