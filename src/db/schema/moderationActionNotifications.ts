import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Bot-authored user DM messages related to an action, so later updates can edit/reference them. */
export const moderationActionNotifications = pgTable('moderation_action_notifications', {
    id: uuid('id').defaultRandom().primaryKey(),
    guildId: text('guild_id').notNull(),
    actionId: text('action_id').notNull(),
    recordType: text('record_type').notNull(),
    recordUuid: uuid('record_uuid').notNull(),
    /** action-dm | update-dm */
    kind: text('kind').notNull(),
    userId: text('user_id').notNull(),
    channelId: text('channel_id').notNull(),
    messageId: text('message_id').notNull(),
    auditId: uuid('audit_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ModerationActionNotification = typeof moderationActionNotifications.$inferSelect;
export type NewModerationActionNotification = typeof moderationActionNotifications.$inferInsert;
