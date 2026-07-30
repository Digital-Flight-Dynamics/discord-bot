import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { identitySnapshots } from './identitySnapshots';

export const warnings = pgTable('warnings', {
    id: uuid('id').defaultRandom().primaryKey(),
    /** Public human Action ID. UUID `id` stays internal. */
    actionId: text('action_id').unique(),
    guildId: text('guild_id').notNull(),
    subjectSnapshotId: uuid('subject_snapshot_id')
        .notNull()
        .references(() => identitySnapshots.id),
    moderatorSnapshotId: uuid('moderator_snapshot_id').references(() => identitySnapshots.id),
    reason: text('reason').notNull(),
    privateNote: text('private_note'),
    linkedMessageId: text('linked_message_id'),
    linkedChannelId: text('linked_channel_id'),
    linkedMessageUrl: text('linked_message_url'),
    linkedMessageDeleted: boolean('linked_message_deleted').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedByModeratorSnapshotId: uuid('removed_by_moderator_snapshot_id').references(() => identitySnapshots.id),
    resolutionStatus: text('resolution_status'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByModeratorSnapshotId: uuid('resolved_by_moderator_snapshot_id').references(() => identitySnapshots.id),
    resolutionReason: text('resolution_reason'),
    resolutionPublicNote: text('resolution_public_note'),
    legacyMongoId: text('legacy_mongo_id').unique(),
});

export type Warning = typeof warnings.$inferSelect;
export type NewWarning = typeof warnings.$inferInsert;
