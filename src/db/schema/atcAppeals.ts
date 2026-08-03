import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Appeals are created by ATC and share the moderation database with the bot. */
export const atcAppeals = pgTable('atc_appeals', {
    id: uuid('id').defaultRandom().primaryKey(),
    actionId: text('action_id').notNull(),
    guildId: text('guild_id').notNull(),
    discordUserId: text('discord_user_id').notNull(),
    answers: jsonb('answers').$type<Record<string, string>>().notNull(),
    status: text('status').notNull().default('submitted'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    reviewStartedAt: timestamp('review_started_at', { withTimezone: true }),
    reviewedByDiscordUserId: text('reviewed_by_discord_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedByDiscordUserId: text('decided_by_discord_user_id'),
    decisionNote: text('decision_note'),
});

export type AtcAppeal = typeof atcAppeals.$inferSelect;
