import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Discord mod-log parent message + discussion thread for a punishment case. */
export const modLogMessages = pgTable('mod_log_messages', {
    id: uuid('id').defaultRandom().primaryKey(),
    guildId: text('guild_id').notNull(),
    /** warning | kick | ban | timeout | unban | other */
    caseType: text('case_type').notNull(),
    /** Related DB row id when applicable (warning/kick/ban uuid) */
    caseId: text('case_id'),
    /** Public Action ID (e.g. A26A07K7X3) */
    actionId: text('action_id'),
    channelId: text('channel_id').notNull(),
    /** Parent message in #mod-logs that holds the embed */
    messageId: text('message_id').notNull().unique(),
    /** Discussion thread started on that message */
    threadId: text('thread_id'),
    subjectUserId: text('subject_user_id'),
    moderatorUserId: text('moderator_user_id'),
    messageDeleted: boolean('message_deleted').notNull().default(false),
    threadDeleted: boolean('thread_deleted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ModLogMessage = typeof modLogMessages.$inferSelect;
export type NewModLogMessage = typeof modLogMessages.$inferInsert;
export type ModCaseType = 'warning' | 'kick' | 'ban' | 'timeout' | 'unban' | 'other';
