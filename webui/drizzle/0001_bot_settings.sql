CREATE TABLE IF NOT EXISTS "bot_settings" (
    "guild_id" text NOT NULL,
    "setting_key" text NOT NULL,
    "setting_value" text NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_by_discord_user_id" text,
    CONSTRAINT "bot_settings_pkey" PRIMARY KEY ("guild_id", "setting_key")
);
