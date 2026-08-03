import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { identitySnapshots } from './identitySnapshots';

/** Immutable audit trail for post-action moderation edits. */
export const moderationActionAudits = pgTable('moderation_action_audits', {
    id: uuid('id').defaultRandom().primaryKey(),
    guildId: text('guild_id').notNull(),
    actionId: text('action_id').notNull(),
    recordType: text('record_type').notNull(),
    recordUuid: uuid('record_uuid').notNull(),
    changeType: text('change_type').notNull(),
    moderatorSnapshotId: uuid('moderator_snapshot_id').references(() => identitySnapshots.id),
    moderatorUserId: text('moderator_user_id').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    rationale: text('rationale').notNull(),
    notifyUser: boolean('notify_user').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ModerationActionAudit = typeof moderationActionAudits.$inferSelect;
export type NewModerationActionAudit = typeof moderationActionAudits.$inferInsert;
