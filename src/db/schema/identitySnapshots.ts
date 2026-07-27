import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const identitySnapshots = pgTable('identity_snapshots', {
    id: uuid('id').defaultRandom().primaryKey(),
    discordUserId: text('discord_user_id').notNull(),
    username: text('username'),
    displayName: text('display_name'),
    pronouns: text('pronouns'),
    bio: text('bio'),
    urls: jsonb('urls').$type<string[]>().notNull().default([]),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
});

export type IdentitySnapshot = typeof identitySnapshots.$inferSelect;
export type NewIdentitySnapshot = typeof identitySnapshots.$inferInsert;
