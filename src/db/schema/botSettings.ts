import { primaryKey, text, timestamp, pgTable } from 'drizzle-orm/pg-core';

/** Per-guild runtime settings managed from the ATC Bot Settings page. */
export const botSettings = pgTable(
    'bot_settings',
    {
        guildId: text('guild_id').notNull(),
        key: text('setting_key').notNull(),
        value: text('setting_value').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        updatedByDiscordUserId: text('updated_by_discord_user_id'),
    },
    (table) => [primaryKey({ columns: [table.guildId, table.key] })],
);

export type BotSetting = typeof botSettings.$inferSelect;
export type NewBotSetting = typeof botSettings.$inferInsert;
