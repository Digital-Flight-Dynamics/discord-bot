import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Global registry of public moderation Action IDs (e.g. A0701.26W-9E6B9F5A81D2C407).
 * Internal rows still use UUIDs; this maps human IDs → record type + uuid.
 */
export const actionIds = pgTable(
    'action_ids',
    {
        actionId: text('action_id').primaryKey(),
        /** warning | kick | ban | timeout | other */
        recordType: text('record_type').notNull(),
        recordUuid: uuid('record_uuid').notNull(),
        guildId: text('guild_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [uniqueIndex('action_ids_record_unique').on(table.recordType, table.recordUuid)],
);

export type ActionIdRow = typeof actionIds.$inferSelect;
export type NewActionIdRow = typeof actionIds.$inferInsert;
