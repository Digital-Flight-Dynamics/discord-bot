import { bigint, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Reusable punishment presets managed by future commands / web UI. */
export const moderationPresets = pgTable('moderation_presets', {
    id: uuid('id').defaultRandom().primaryKey(),
    guildId: text('guild_id').notNull(),
    name: text('name').notNull(),
    reason: text('reason').notNull(),
    durationMs: bigint('duration_ms', { mode: 'number' }),
    durationToken: text('duration_token'),
    deleteMessageSeconds: integer('delete_message_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ModerationPreset = typeof moderationPresets.$inferSelect;
export type NewModerationPreset = typeof moderationPresets.$inferInsert;
