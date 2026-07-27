import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * In-flight moderation commands (awaiting private note / submit / cancel).
 * Survives bot restarts — unfinished rows are completed without a note on boot.
 */
export const pendingModerationActions = pgTable('pending_moderation_actions', {
    id: uuid('id').defaultRandom().primaryKey(),
    guildId: text('guild_id').notNull(),
    /** warn | kick | ban | timeout */
    actionType: text('action_type').notNull(),
    /** pending | completed | cancelled */
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
    commandChannelId: text('command_channel_id'),
    commandMessageId: text('command_message_id'),
    confirmChannelId: text('confirm_channel_id'),
    confirmMessageId: text('confirm_message_id'),
    linkedMessageId: text('linked_message_id'),
    linkedChannelId: text('linked_channel_id'),
    linkedMessageUrl: text('linked_message_url'),
    /** Extra JSON if needed later */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    resultCaseId: text('result_case_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type PendingModerationAction = typeof pendingModerationActions.$inferSelect;
export type NewPendingModerationAction = typeof pendingModerationActions.$inferInsert;
export type PendingActionType = 'warn' | 'kick' | 'ban' | 'timeout';
export type PendingActionStatus = 'pending' | 'completed' | 'cancelled';
