-- This column was added to the consolidated initial schema after some
-- development databases had already recorded 0000_init.sql as applied.
ALTER TABLE "pending_moderation_actions"
    ADD COLUMN IF NOT EXISTS "discord_applied_at" timestamp with time zone;
