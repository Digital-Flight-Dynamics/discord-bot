import { and, eq, inArray, lt } from 'drizzle-orm';
import { getDb } from '../client';
import {
    pendingModerationActions,
    type PendingActionStatus,
    type PendingActionType,
    type PendingModerationAction,
} from '../schema';

export async function createPendingModeration(input: {
    guildId: string;
    actionType: PendingActionType;
    subjectUserId: string;
    moderatorUserId: string;
    reason: string;
    durationMs?: number | null;
    durationToken?: string | null;
    expiresAt?: Date | null;
    deleteMessageSeconds?: number | null;
    banType?: string | null;
    commandChannelId?: string | null;
    commandMessageId?: string | null;
    linkedMessageId?: string | null;
    linkedChannelId?: string | null;
    linkedMessageUrl?: string | null;
    payload?: Record<string, unknown>;
}): Promise<PendingModerationAction> {
    const db = getDb();
    const [row] = await db
        .insert(pendingModerationActions)
        .values({
            guildId: input.guildId,
            actionType: input.actionType,
            status: 'pending',
            subjectUserId: input.subjectUserId,
            moderatorUserId: input.moderatorUserId,
            reason: input.reason,
            durationMs: input.durationMs ?? null,
            durationToken: input.durationToken ?? null,
            expiresAt: input.expiresAt ?? null,
            deleteMessageSeconds: input.deleteMessageSeconds ?? null,
            banType: input.banType ?? null,
            commandChannelId: input.commandChannelId ?? null,
            commandMessageId: input.commandMessageId ?? null,
            linkedMessageId: input.linkedMessageId ?? null,
            linkedChannelId: input.linkedChannelId ?? null,
            linkedMessageUrl: input.linkedMessageUrl ?? null,
            payload: input.payload ?? {},
        })
        .returning();
    return row;
}

export async function updatePendingModeration(
    id: string,
    patch: Partial<{
        privateNote: string | null;
        confirmChannelId: string | null;
        confirmMessageId: string | null;
        status: PendingActionStatus;
        resultCaseId: string | null;
        completedAt: Date | null;
    }>,
): Promise<PendingModerationAction | null> {
    const db = getDb();
    const [row] = await db
        .update(pendingModerationActions)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(pendingModerationActions.id, id))
        .returning();
    return row ?? null;
}

export async function getPendingModerationById(id: string): Promise<PendingModerationAction | null> {
    const db = getDb();
    const rows = await db.select().from(pendingModerationActions).where(eq(pendingModerationActions.id, id)).limit(1);
    return rows[0] ?? null;
}

/**
 * Atomically transition a row from `pending` to `processing`. Returns null if the row
 * is missing or was already claimed/completed/cancelled by another caller, preventing
 * concurrent workers or a crash-then-restart replay from executing the same action twice.
 */
export async function claimPendingModeration(id: string): Promise<PendingModerationAction | null> {
    const db = getDb();
    const [row] = await db
        .update(pendingModerationActions)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(and(eq(pendingModerationActions.id, id), eq(pendingModerationActions.status, 'pending')))
        .returning();
    return row ?? null;
}

/** Requeue a stale processing row after a process crash so it can be claimed again. */
export async function requeueProcessingPendingModeration(id: string): Promise<PendingModerationAction | null> {
    const db = getDb();
    const [row] = await db
        .update(pendingModerationActions)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(and(eq(pendingModerationActions.id, id), eq(pendingModerationActions.status, 'processing')))
        .returning();
    return row ?? null;
}

export async function listPendingModerationActions(): Promise<PendingModerationAction[]> {
    const db = getDb();
    return db.select().from(pendingModerationActions).where(eq(pendingModerationActions.status, 'pending'));
}

/** Pending rows older than `olderThanMs` (for safe resume after restart). */
export async function listStalePendingModerationActions(olderThanMs = 5_000): Promise<PendingModerationAction[]> {
    const db = getDb();
    const cutoff = new Date(Date.now() - olderThanMs);
    return db
        .select()
        .from(pendingModerationActions)
        .where(and(inArray(pendingModerationActions.status, ['pending', 'processing']), lt(pendingModerationActions.updatedAt, cutoff)));
}

/** Records the created case immediately after its Discord side effect succeeds.
 * If a later DM/log update fails, recovery knows the punishment already happened. */
export async function markPendingActionApplied(id: string, resultCaseId: string): Promise<void> {
    await updatePendingModeration(id, { resultCaseId });
}

export async function markPendingCompleted(id: string, resultCaseId: string | null): Promise<void> {
    await updatePendingModeration(id, {
        status: 'completed',
        resultCaseId,
        completedAt: new Date(),
    });
}

export async function markPendingCancelled(id: string): Promise<void> {
    await updatePendingModeration(id, {
        status: 'cancelled',
        completedAt: new Date(),
    });
}

export async function markPendingFailed(id: string): Promise<void> {
    await updatePendingModeration(id, {
        status: 'failed',
        completedAt: new Date(),
    });
}
