CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "identity_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" text NOT NULL,
	"username" text,
	"display_name" text,
	"pronouns" text,
	"bio" text,
	"urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" text,
	"guild_id" text NOT NULL,
	"subject_snapshot_id" uuid NOT NULL,
	"moderator_snapshot_id" uuid,
	"reason" text NOT NULL,
	"private_note" text,
	"linked_message_id" text,
	"linked_channel_id" text,
	"linked_message_url" text,
	"linked_message_deleted" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_moderator_snapshot_id" uuid,
	"legacy_mongo_id" text,
	CONSTRAINT "warnings_legacy_mongo_id_unique" UNIQUE("legacy_mongo_id")
);

CREATE TABLE IF NOT EXISTS "kicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" text,
	"guild_id" text NOT NULL,
	"subject_snapshot_id" uuid NOT NULL,
	"moderator_snapshot_id" uuid,
	"reason" text NOT NULL,
	"private_note" text,
	"linked_message_id" text,
	"linked_channel_id" text,
	"linked_message_url" text,
	"linked_message_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_automated" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'bot' NOT NULL
);

ALTER TABLE "kicks" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'bot' NOT NULL;

CREATE TABLE IF NOT EXISTS "bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" text,
	"guild_id" text NOT NULL,
	"subject_snapshot_id" uuid NOT NULL,
	"moderator_snapshot_id" uuid,
	"reason" text NOT NULL,
	"linked_message_id" text,
	"linked_channel_id" text,
	"linked_message_url" text,
	"linked_message_deleted" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"ban_type" text NOT NULL,
	"private_notes" text,
	"delete_message_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by_moderator_snapshot_id" uuid,
	"lift_reason" text,
	"source" text DEFAULT 'bot' NOT NULL
);

ALTER TABLE "bans" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'bot' NOT NULL;

DO $$ BEGIN
 ALTER TABLE "warnings" ADD CONSTRAINT "warnings_subject_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("subject_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "warnings" ADD CONSTRAINT "warnings_moderator_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("moderator_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "warnings" ADD CONSTRAINT "warnings_removed_by_moderator_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("removed_by_moderator_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "kicks" ADD CONSTRAINT "kicks_subject_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("subject_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "kicks" ADD CONSTRAINT "kicks_moderator_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("moderator_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "bans" ADD CONSTRAINT "bans_subject_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("subject_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "bans" ADD CONSTRAINT "bans_moderator_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("moderator_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "bans" ADD CONSTRAINT "bans_lifted_by_moderator_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("lifted_by_moderator_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "identity_snapshots_discord_user_id_idx" ON "identity_snapshots" ("discord_user_id");
CREATE INDEX IF NOT EXISTS "warnings_guild_id_created_at_idx" ON "warnings" ("guild_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "warnings_expires_at_idx" ON "warnings" ("expires_at") WHERE "removed_at" IS NULL AND "expires_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "kicks_guild_id_created_at_idx" ON "kicks" ("guild_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "bans_guild_id_created_at_idx" ON "bans" ("guild_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "bans_expires_at_idx" ON "bans" ("expires_at") WHERE "lifted_at" IS NULL AND "expires_at" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "mod_log_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"case_type" text NOT NULL,
	"case_id" text,
	"action_id" text,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text,
	"subject_user_id" text,
	"moderator_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mod_log_messages_message_id_unique" UNIQUE("message_id")
);

CREATE INDEX IF NOT EXISTS "mod_log_messages_guild_id_created_at_idx" ON "mod_log_messages" ("guild_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "mod_log_messages_case_id_idx" ON "mod_log_messages" ("case_id");

CREATE TABLE IF NOT EXISTS "timeouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" text,
	"guild_id" text NOT NULL,
	"subject_snapshot_id" uuid NOT NULL,
	"moderator_snapshot_id" uuid,
	"reason" text NOT NULL,
	"private_note" text,
	"duration_ms" bigint NOT NULL,
	"duration_token" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'bot' NOT NULL
);

ALTER TABLE "timeouts" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'bot' NOT NULL;
ALTER TABLE "timeouts" ALTER COLUMN "duration_ms" TYPE bigint;

DO $$ BEGIN
 ALTER TABLE "timeouts" ADD CONSTRAINT "timeouts_subject_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("subject_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "timeouts" ADD CONSTRAINT "timeouts_moderator_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("moderator_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "timeouts_guild_id_created_at_idx" ON "timeouts" ("guild_id", "created_at" DESC);


CREATE TABLE IF NOT EXISTS "moderation_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"reason" text NOT NULL,
	"duration_ms" bigint,
	"duration_token" text,
	"delete_message_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "moderation_presets" ALTER COLUMN "duration_ms" TYPE bigint;

ALTER TABLE "moderation_presets" DROP COLUMN IF EXISTS "action_type";
ALTER TABLE "moderation_presets" DROP COLUMN IF EXISTS "ban_type";

CREATE INDEX IF NOT EXISTS "moderation_presets_guild_id_idx" ON "moderation_presets" ("guild_id");


CREATE TABLE IF NOT EXISTS "moderation_action_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"action_id" text NOT NULL,
	"record_type" text NOT NULL,
	"record_uuid" uuid NOT NULL,
	"change_type" text NOT NULL,
	"moderator_snapshot_id" uuid,
	"moderator_user_id" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"rationale" text NOT NULL,
	"notify_user" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "moderation_action_audits" ADD CONSTRAINT "moderation_action_audits_moderator_snapshot_id_identity_snapshots_id_fk" FOREIGN KEY ("moderator_snapshot_id") REFERENCES "public"."identity_snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "moderation_action_audits_action_id_created_at_idx" ON "moderation_action_audits" ("action_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "moderation_action_audits_guild_id_idx" ON "moderation_action_audits" ("guild_id");


CREATE TABLE IF NOT EXISTS "moderation_action_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"action_id" text NOT NULL,
	"record_type" text NOT NULL,
	"record_uuid" uuid NOT NULL,
	"kind" text NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"audit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_action_notifications_action_id_kind_idx" ON "moderation_action_notifications" ("action_id", "kind");

CREATE TABLE IF NOT EXISTS "pending_moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"action_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"subject_user_id" text NOT NULL,
	"moderator_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"private_note" text,
	"duration_ms" bigint,
	"duration_token" text,
	"expires_at" timestamp with time zone,
	"delete_message_seconds" integer,
	"ban_type" text,
	"command_channel_id" text,
	"command_message_id" text,
	"confirm_channel_id" text,
	"confirm_message_id" text,
	"linked_message_id" text,
	"linked_channel_id" text,
	"linked_message_url" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_case_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);

ALTER TABLE "pending_moderation_actions" ALTER COLUMN "duration_ms" TYPE bigint;

CREATE INDEX IF NOT EXISTS "pending_moderation_actions_status_idx" ON "pending_moderation_actions" ("status") WHERE "status" = 'pending';
CREATE INDEX IF NOT EXISTS "pending_moderation_actions_guild_id_idx" ON "pending_moderation_actions" ("guild_id");

CREATE TABLE IF NOT EXISTS "action_ids" (
	"action_id" text PRIMARY KEY NOT NULL,
	"record_type" text NOT NULL,
	"record_uuid" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "action_ids_record_uuid_idx" ON "action_ids" ("record_uuid");
CREATE INDEX IF NOT EXISTS "action_ids_guild_id_idx" ON "action_ids" ("guild_id");

CREATE UNIQUE INDEX IF NOT EXISTS "warnings_action_id_unique" ON "warnings" ("action_id");
CREATE UNIQUE INDEX IF NOT EXISTS "kicks_action_id_unique" ON "kicks" ("action_id");
CREATE UNIQUE INDEX IF NOT EXISTS "bans_action_id_unique" ON "bans" ("action_id");
CREATE UNIQUE INDEX IF NOT EXISTS "timeouts_action_id_unique" ON "timeouts" ("action_id");
