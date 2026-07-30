import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../client';
import { actionIds, identitySnapshots, kicks, Kick, moderationActionNotifications, pendingModerationActions } from '../schema';
import { LinkedMessage } from '../../lib/moderation';
import { allocateActionId } from '../../lib/actionId';

export type KickWithSnapshots = Kick & {
    subject: typeof identitySnapshots.$inferSelect;
    moderator: typeof identitySnapshots.$inferSelect | null;
};

async function loadSnapshotsByIds(ids: string[]) {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return new Map<string, typeof identitySnapshots.$inferSelect>();
    const db = getDb();
    const rows = await db.select().from(identitySnapshots).where(inArray(identitySnapshots.id, unique));
    return new Map(rows.map((r) => [r.id, r]));
}

async function hydrate(rows: Kick[]): Promise<KickWithSnapshots[]> {
    const snapMap = await loadSnapshotsByIds(
        rows.flatMap((r) => [r.subjectSnapshotId, r.moderatorSnapshotId].filter(Boolean) as string[]),
    );
    return rows.map((r) => ({
        ...r,
        subject: snapMap.get(r.subjectSnapshotId)!,
        moderator: r.moderatorSnapshotId ? snapMap.get(r.moderatorSnapshotId) || null : null,
    }));
}

export async function createKick(input: {
    guildId: string;
    subjectSnapshotId: string;
    moderatorSnapshotId: string | null;
    reason: string;
    privateNote?: string | null;
    linked?: LinkedMessage | null;
    isAutomated?: boolean;
    source?: string;
    discordAuditLogId?: string | null;
    pendingActionId?: string;
}): Promise<Kick> {
    const db = getDb();
    return db.transaction(async (tx) => {
        const [row] = await tx.insert(kicks).values({
            guildId: input.guildId,
            subjectSnapshotId: input.subjectSnapshotId,
            moderatorSnapshotId: input.moderatorSnapshotId,
            reason: input.reason,
            privateNote: input.privateNote ?? null,
            linkedMessageId: input.linked?.linkedMessageId ?? null,
            linkedChannelId: input.linked?.linkedChannelId ?? null,
            linkedMessageUrl: input.linked?.linkedMessageUrl ?? null,
            linkedMessageDeleted: input.linked?.linkedMessageDeleted ?? false,
            isAutomated: input.isAutomated ?? false,
            source: input.source ?? 'bot',
            discordAuditLogId: input.discordAuditLogId ?? null,
        }).returning();

        const actionId = await allocateActionId(
            { recordType: 'kick', recordUuid: row.id, guildId: input.guildId },
            async (value) => {
                await tx.insert(actionIds).values(value);
            },
        );
        const [withAction] = await tx.update(kicks).set({ actionId }).where(eq(kicks.id, row.id)).returning();
        if (input.pendingActionId) {
            await tx
                .update(pendingModerationActions)
                .set({ resultCaseId: row.id, updatedAt: new Date() })
                .where(eq(pendingModerationActions.id, input.pendingActionId));
        }
        return withAction;
    });
}

export async function listKicksForUser(guildId: string, discordUserId: string): Promise<KickWithSnapshots[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(kicks)
        .innerJoin(identitySnapshots, eq(kicks.subjectSnapshotId, identitySnapshots.id))
        .where(and(eq(kicks.guildId, guildId), eq(identitySnapshots.discordUserId, discordUserId)))
        .orderBy(desc(kicks.createdAt));
    return hydrate(rows.map((r) => r.kicks));
}

export async function deleteKickById(id: string, pendingActionId?: string): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
        await tx.delete(actionIds).where(eq(actionIds.recordUuid, id));
        await tx.delete(moderationActionNotifications).where(eq(moderationActionNotifications.recordUuid, id));
        await tx.delete(kicks).where(eq(kicks.id, id));
        if (pendingActionId) {
            await tx
                .update(pendingModerationActions)
                .set({ resultCaseId: null, updatedAt: new Date() })
                .where(and(
                    eq(pendingModerationActions.id, pendingActionId),
                    eq(pendingModerationActions.resultCaseId, id),
                ));
        }
    });
}
