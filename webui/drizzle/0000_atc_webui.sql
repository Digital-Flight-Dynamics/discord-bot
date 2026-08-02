CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "atc_oauth_states" (
    "state_hash" text PRIMARY KEY,
    "code_verifier" text NOT NULL,
    "return_to" text NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "atc_sessions" (
    "token_hash" text PRIMARY KEY,
    "discord_user_id" text NOT NULL,
    "username" text NOT NULL,
    "global_name" text,
    "avatar_hash" text,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "atc_sessions_user_idx"
    ON "atc_sessions" ("discord_user_id");

CREATE TABLE IF NOT EXISTS "atc_appeal_windows" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_hash" text NOT NULL,
    "discord_user_id" text NOT NULL,
    "action_id" text NOT NULL,
    "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "math_prompt" text NOT NULL,
    "math_answer" text NOT NULL,
    "answers" jsonb,
    "prepared_at" timestamp with time zone,
    "consumed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "atc_appeal_windows_lookup_idx"
    ON "atc_appeal_windows" ("id", "session_hash", "discord_user_id");

CREATE TABLE IF NOT EXISTS "atc_appeals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "action_id" text NOT NULL,
    "guild_id" text NOT NULL,
    "discord_user_id" text NOT NULL,
    "answers" jsonb NOT NULL,
    "status" text DEFAULT 'submitted' NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "review_started_at" timestamp with time zone,
    "decided_at" timestamp with time zone,
    "decision_note" text,
    "reviewed_by_discord_user_id" text,
    "decided_by_discord_user_id" text,
    CONSTRAINT "atc_appeals_status_valid"
        CHECK ("status" IN ('submitted', 'review', 'approved', 'denied'))
);

CREATE INDEX IF NOT EXISTS "atc_appeals_user_submitted_idx"
    ON "atc_appeals" ("discord_user_id", "submitted_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "atc_appeals_one_open_per_action_user_idx"
    ON "atc_appeals" (upper("action_id"), "discord_user_id")
    WHERE "status" IN ('submitted', 'review');

CREATE INDEX IF NOT EXISTS "atc_appeals_action_submitted_idx"
    ON "atc_appeals" (upper("action_id"), "submitted_at" DESC);
