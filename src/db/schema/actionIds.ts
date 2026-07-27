import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Global registry of public moderation Action IDs (e.g. A26A07K7X3).
 * Internal rows still use UUIDs; this maps human IDs → record type + uuid.
 */
export const actionIds = pgTable('action_ids', {
    actionId: text('action_id').primaryKey(),
    /** warning | kick | ban | timeout | other */
    recordType: text('record_type').notNull(),
    recordUuid: uuid('record_uuid').notNull(),
    guildId: text('guild_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ActionIdRow = typeof actionIds.$inferSelect;
