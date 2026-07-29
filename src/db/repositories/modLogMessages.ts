import { and, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { modLogMessages, type ModCaseType, type ModLogMessage } from '../schema';

export async function createModLogMessage(input: {
    guildId: string;
    caseType: ModCaseType;
    caseId?: string | null;
    actionId?: string | null;
    channelId: string;
    messageId: string;
    threadId?: string | null;
    subjectUserId?: string | null;
    moderatorUserId?: string | null;
}): Promise<ModLogMessage> {
    const db = getDb();
    const [row] = await db
        .insert(modLogMessages)
        .values({
            guildId: input.guildId,
            caseType: input.caseType,
            caseId: input.caseId ?? null,
            actionId: input.actionId ?? null,
            channelId: input.channelId,
            messageId: input.messageId,
            threadId: input.threadId ?? null,
            subjectUserId: input.subjectUserId ?? null,
            moderatorUserId: input.moderatorUserId ?? null,
        })
        .returning();
    return row;
}

export async function findModLogByMessageId(messageId: string): Promise<ModLogMessage | null> {
    const db = getDb();
    const rows = await db.select().from(modLogMessages).where(eq(modLogMessages.messageId, messageId)).limit(1);
    return rows[0] ?? null;
}

export async function findModLogByThreadId(threadId: string): Promise<ModLogMessage | null> {
    const db = getDb();
    const rows = await db.select().from(modLogMessages).where(eq(modLogMessages.threadId, threadId)).limit(1);
    return rows[0] ?? null;
}

export async function findModLogByCase(caseType: ModCaseType, caseId: string): Promise<ModLogMessage | null> {
    const db = getDb();
    const rows = await db
        .select()
        .from(modLogMessages)
        .where(eq(modLogMessages.caseId, caseId))
        .limit(5);
    return rows.find((r) => r.caseType === caseType) ?? rows[0] ?? null;
}

export async function findModLogByActionId(guildId: string, actionId: string): Promise<ModLogMessage | null> {
    const db = getDb();
    const rows = await db
        .select()
        .from(modLogMessages)
        .where(and(eq(modLogMessages.guildId, guildId), eq(modLogMessages.actionId, actionId)))
        .limit(1);
    return rows[0] ?? null;
}

export async function markModLogMessageDeleted(id: string): Promise<void> {
    const db = getDb();
    await db.update(modLogMessages).set({ messageDeleted: true }).where(eq(modLogMessages.id, id));
}

export async function claimModLogThreadDeleted(id: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
        .update(modLogMessages)
        .set({ threadDeleted: true })
        .where(and(eq(modLogMessages.id, id), eq(modLogMessages.threadDeleted, false)))
        .returning({ id: modLogMessages.id });
    return rows.length > 0;
}
