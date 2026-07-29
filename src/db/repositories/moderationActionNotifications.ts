import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import {
    moderationActionNotifications,
    type ModerationActionNotification,
    type NewModerationActionNotification,
} from '../schema';

export async function createModerationActionNotification(
    input: NewModerationActionNotification,
): Promise<ModerationActionNotification> {
    const db = getDb();
    const [row] = await db.insert(moderationActionNotifications).values(input).returning();
    return row;
}

export async function findLatestActionNotification(
    actionId: string,
    kind: string,
): Promise<ModerationActionNotification | null> {
    const db = getDb();
    const rows = await db
        .select()
        .from(moderationActionNotifications)
        .where(and(eq(moderationActionNotifications.actionId, actionId), eq(moderationActionNotifications.kind, kind)))
        .orderBy(desc(moderationActionNotifications.createdAt))
        .limit(1);
    return rows[0] ?? null;
}

export async function findActionNotificationByMessageId(
    messageId: string,
): Promise<ModerationActionNotification | null> {
    const db = getDb();
    const rows = await db
        .select()
        .from(moderationActionNotifications)
        .where(eq(moderationActionNotifications.messageId, messageId))
        .limit(1);
    return rows[0] ?? null;
}

export async function markActionNotificationFailed(id: string, reason: string): Promise<void> {
    const db = getDb();
    await db
        .update(moderationActionNotifications)
        .set({
            messageDeleted: true,
            failureReason: reason,
            failedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(moderationActionNotifications.id, id));
}
