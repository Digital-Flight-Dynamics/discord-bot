import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../client';
import { actionIds, identitySnapshots, moderationActionNotifications, pendingModerationActions, timeouts, Timeout } from '../schema';
import { allocateActionId } from '../../lib/actionId';
import { MAX_DISCORD_TIMEOUT_MS } from '../../lib/moderationDuration';

export async function createTimeout(input: {
    guildId: string;
    subjectSnapshotId: string;
    moderatorSnapshotId: string | null;
    reason: string;
    privateNote?: string | null;
    durationMs: number;
    durationToken?: string | null;
    expiresAt?: Date | null;
    source?: string;
    discordAuditLogId?: string | null;
    pendingActionId?: string;
}): Promise<Timeout> {
    const db = getDb();
    const durationMs = Math.min(input.durationMs, MAX_DISCORD_TIMEOUT_MS);
    const maxExpiresAt = new Date(Date.now() + durationMs);
    const expiresAt = input.expiresAt && input.expiresAt < maxExpiresAt ? input.expiresAt : maxExpiresAt;
    return db.transaction(async (tx) => {
        const [row] = await tx.insert(timeouts).values({
            guildId: input.guildId,
            subjectSnapshotId: input.subjectSnapshotId,
            moderatorSnapshotId: input.moderatorSnapshotId,
            reason: input.reason,
            privateNote: input.privateNote ?? null,
            durationMs,
            durationToken: input.durationToken ?? null,
            expiresAt,
            source: input.source ?? 'bot',
            discordAuditLogId: input.discordAuditLogId ?? null,
        }).returning();

        const actionId = await allocateActionId(
            { recordType: 'timeout', recordUuid: row.id, guildId: input.guildId },
            async (value) => {
                await tx.insert(actionIds).values(value);
            },
        );
        const [withAction] = await tx.update(timeouts).set({ actionId }).where(eq(timeouts.id, row.id)).returning();
        if (input.pendingActionId) {
            await tx
                .update(pendingModerationActions)
                .set({ resultCaseId: row.id, updatedAt: new Date() })
                .where(eq(pendingModerationActions.id, input.pendingActionId));
        }
        return withAction;
    });
}

export async function countTimeoutsForUser(guildId: string, discordUserId: string): Promise<number> {
    const db = getDb();
    const rows = await db
        .select({ id: timeouts.id })
        .from(timeouts)
        .innerJoin(identitySnapshots, eq(timeouts.subjectSnapshotId, identitySnapshots.id))
        .where(
            and(
                eq(timeouts.guildId, guildId),
                eq(identitySnapshots.discordUserId, discordUserId),
                isNull(timeouts.resolutionStatus),
            ),
        );
    return rows.length;
}

export type TimeoutWithModerator = Timeout & {
    moderator: typeof identitySnapshots.$inferSelect | null;
};

export async function listTimeoutsForUser(guildId: string, discordUserId: string): Promise<TimeoutWithModerator[]> {
    const db = getDb();
    const rows = await db
        .select({ timeout: timeouts })
        .from(timeouts)
        .innerJoin(identitySnapshots, eq(timeouts.subjectSnapshotId, identitySnapshots.id))
        .where(and(eq(timeouts.guildId, guildId), eq(identitySnapshots.discordUserId, discordUserId)))
        .orderBy(desc(timeouts.createdAt));
    const moderatorIds = [...new Set(rows.map((row) => row.timeout.moderatorSnapshotId).filter(Boolean) as string[])];
    const moderatorRows = moderatorIds.length
        ? await db.select().from(identitySnapshots).where(inArray(identitySnapshots.id, moderatorIds))
        : [];
    const moderators = new Map(moderatorRows.map((snapshot) => [snapshot.id, snapshot]));
    return rows.map(({ timeout }) => ({
        ...timeout,
        moderator: timeout.moderatorSnapshotId ? moderators.get(timeout.moderatorSnapshotId) || null : null,
    }));
}

export async function deleteTimeoutById(id: string, pendingActionId?: string): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
        await tx.delete(actionIds).where(eq(actionIds.recordUuid, id));
        await tx.delete(moderationActionNotifications).where(eq(moderationActionNotifications.recordUuid, id));
        await tx.delete(timeouts).where(eq(timeouts.id, id));
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
