import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { identitySnapshots } from './identitySnapshots';

export const kicks = pgTable('kicks', {
    id: uuid('id').defaultRandom().primaryKey(),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    isAutomated: boolean('is_automated').notNull().default(false),
    source: text('source').notNull().default('bot'),
});

export type Kick = typeof kicks.$inferSelect;
export type NewKick = typeof kicks.$inferInsert;
