import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { identitySnapshots } from './identitySnapshots';

/** Recorded Discord timeouts (mutes) for infraction history. */
export const timeouts = pgTable('timeouts', {
    id: uuid('id').defaultRandom().primaryKey(),
    actionId: text('action_id').unique(),
    guildId: text('guild_id').notNull(),
    subjectSnapshotId: uuid('subject_snapshot_id')
        .notNull()
        .references(() => identitySnapshots.id),
    moderatorSnapshotId: uuid('moderator_snapshot_id').references(() => identitySnapshots.id),
    reason: text('reason').notNull(),
    privateNote: text('private_note'),
    durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
    durationToken: text('duration_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Timeout = typeof timeouts.$inferSelect;
export type NewTimeout = typeof timeouts.$inferInsert;
