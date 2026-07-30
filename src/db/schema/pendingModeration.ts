import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Durable moderation execution state used for crash recovery.
 */
export const pendingModerationActions = pgTable('pending_moderation_actions', {
    id: uuid('id').defaultRandom().primaryKey(),
    guildId: text('guild_id').notNull(),
    /** warn | kick | ban | timeout */
    actionType: text('action_type').notNull(),
    /** pending | processing | completed | cancelled | failed */
    status: text('status').notNull().default('pending'),
    subjectUserId: text('subject_user_id').notNull(),
    moderatorUserId: text('moderator_user_id').notNull(),
    reason: text('reason').notNull(),
    privateNote: text('private_note'),
    durationMs: bigint('duration_ms', { mode: 'number' }),
    durationToken: text('duration_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deleteMessageSeconds: integer('delete_message_seconds'),
    banType: text('ban_type'),
    linkedMessageId: text('linked_message_id'),
    linkedChannelId: text('linked_channel_id'),
    linkedMessageUrl: text('linked_message_url'),
    /** Extra JSON if needed later */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    resultCaseId: text('result_case_id'),
    discordAppliedAt: timestamp('discord_applied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type PendingModerationAction = typeof pendingModerationActions.$inferSelect;
export type NewPendingModerationAction = typeof pendingModerationActions.$inferInsert;
export type PendingActionType = 'warn' | 'kick' | 'ban' | 'timeout';
export type PendingActionStatus = 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
