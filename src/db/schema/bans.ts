import { bigint, boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { identitySnapshots } from './identitySnapshots';

export const bans = pgTable('bans', {
    id: uuid('id').defaultRandom().primaryKey(),
    actionId: text('action_id').unique(),
    guildId: text('guild_id').notNull(),
    subjectSnapshotId: uuid('subject_snapshot_id')
        .notNull()
        .references(() => identitySnapshots.id),
    moderatorSnapshotId: uuid('moderator_snapshot_id').references(() => identitySnapshots.id),
    reason: text('reason').notNull(),
    linkedMessageId: text('linked_message_id'),
    linkedChannelId: text('linked_channel_id'),
    linkedMessageUrl: text('linked_message_url'),
    linkedMessageDeleted: boolean('linked_message_deleted').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    durationMs: bigint('duration_ms', { mode: 'number' }),
    durationToken: text('duration_token'),
    recordExpiresAt: timestamp('record_expires_at', { withTimezone: true }),
    banType: text('ban_type').notNull(), // 'soft' | 'hard'
    privateNotes: text('private_notes'),
    deleteMessageSeconds: integer('delete_message_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),
    liftedByModeratorSnapshotId: uuid('lifted_by_moderator_snapshot_id').references(() => identitySnapshots.id),
    liftReason: text('lift_reason'),
    source: text('source').notNull().default('bot'),
    discordAuditLogId: text('discord_audit_log_id').unique(),
    resolutionStatus: text('resolution_status'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByModeratorSnapshotId: uuid('resolved_by_moderator_snapshot_id').references(() => identitySnapshots.id),
    resolutionReason: text('resolution_reason'),
    resolutionPublicNote: text('resolution_public_note'),
});

export type Ban = typeof bans.$inferSelect;
export type NewBan = typeof bans.$inferInsert;
export type BanType = 'soft' | 'hard';
