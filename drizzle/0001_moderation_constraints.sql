-- Database-level guards mirror the TypeScript unions and protect direct SQL/scripts.
DO $$ BEGIN
 ALTER TABLE pending_moderation_actions ADD CONSTRAINT pending_moderation_actions_status_check CHECK (status IN ('pending','processing','completed','cancelled','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE pending_moderation_actions ADD CONSTRAINT pending_moderation_actions_action_type_check CHECK (action_type IN ('warn','kick','ban','timeout'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE bans ADD CONSTRAINT bans_ban_type_check CHECK (ban_type IN ('soft','hard'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE warnings ADD CONSTRAINT warnings_resolution_status_check CHECK (resolution_status IS NULL OR resolution_status IN ('revoked','appeal-approved'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE kicks ADD CONSTRAINT kicks_resolution_status_check CHECK (resolution_status IS NULL OR resolution_status IN ('revoked','appeal-approved'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE bans ADD CONSTRAINT bans_resolution_status_check CHECK (resolution_status IS NULL OR resolution_status IN ('revoked','appeal-approved'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE timeouts ADD CONSTRAINT timeouts_resolution_status_check CHECK (resolution_status IS NULL OR resolution_status IN ('revoked','appeal-approved'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Discord timeouts cannot outlive its 28-day enforcement limit.
UPDATE timeouts
SET duration_ms = LEAST(duration_ms, 2419200000),
    expires_at = LEAST(COALESCE(expires_at, created_at + interval '28 days'), created_at + interval '28 days')
WHERE duration_ms > 2419200000;
DO $$ BEGIN
 ALTER TABLE timeouts ADD CONSTRAINT timeouts_duration_max_check CHECK (duration_ms > 0 AND duration_ms <= 2419200000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
 ALTER TABLE pending_moderation_actions ADD CONSTRAINT pending_moderation_actions_timeout_max_check CHECK (action_type <> 'timeout' OR duration_ms IS NULL OR (duration_ms > 0 AND duration_ms <= 2419200000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
