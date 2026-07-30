ALTER TABLE "atc_appeals"
    DROP CONSTRAINT IF EXISTS "atc_appeals_action_user_unique";

ALTER TABLE "atc_appeals"
    ADD COLUMN IF NOT EXISTS "reviewed_by_discord_user_id" text,
    ADD COLUMN IF NOT EXISTS "decided_by_discord_user_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "atc_appeals_one_open_per_action_user_idx"
    ON "atc_appeals" (upper("action_id"), "discord_user_id")
    WHERE "status" IN ('submitted', 'review');

CREATE INDEX IF NOT EXISTS "atc_appeals_action_submitted_idx"
    ON "atc_appeals" (upper("action_id"), "submitted_at" DESC);
