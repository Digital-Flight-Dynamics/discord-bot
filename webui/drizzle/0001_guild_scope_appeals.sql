ALTER TABLE "atc_appeal_windows" ADD COLUMN IF NOT EXISTS "guild_id" text;

UPDATE "atc_appeal_windows" windows
   SET "guild_id" = appeals."guild_id"
  FROM "atc_appeals" appeals
 WHERE windows."guild_id" IS NULL
   AND upper(windows."action_id") = upper(appeals."action_id");

-- Unsubmitted legacy windows cannot be assigned safely and expire after 30 minutes anyway.
DELETE FROM "atc_appeal_windows" WHERE "guild_id" IS NULL;
ALTER TABLE "atc_appeal_windows" ALTER COLUMN "guild_id" SET NOT NULL;

DROP INDEX IF EXISTS "atc_appeal_windows_lookup_idx";
CREATE INDEX "atc_appeal_windows_lookup_idx"
    ON "atc_appeal_windows" ("guild_id", "id", "session_hash", "discord_user_id");

DROP INDEX IF EXISTS "atc_appeals_one_open_per_action_user_idx";
CREATE UNIQUE INDEX "atc_appeals_one_open_per_action_user_idx"
    ON "atc_appeals" ("guild_id", upper("action_id"), "discord_user_id")
    WHERE "status" IN ('submitted', 'review');
