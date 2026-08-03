import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';
import { getDb } from '../client';
import { actionIds, bans, Ban, BanType, identitySnapshots, moderationActionNotifications, pendingModerationActions } from '../schema';
import { LinkedMessage } from '../../lib/moderation';
import { loadIdentitySnapshotsByIds } from './snapshots';
import { allocateActionId } from '../../lib/actionId';

export type BanWithSnapshots = Ban & {
    subject: typeof identitySnapshots.$inferSelect;
    moderator: typeof identitySnapshots.$inferSelect | null;
};

async function hydrate(rows: Ban[]): Promise<BanWithSnapshots[]> {
    const snapMap = await loadIdentitySnapshotsByIds(
        rows.flatMap((r) => [r.subjectSnapshotId, r.moderatorSnapshotId, r.liftedByModeratorSnapshotId].filter(Boolean) as string[]),
    );
    return rows.map((r) => ({
        ...r,
        subject: snapMap.get(r.subjectSnapshotId)!,
        moderator: r.moderatorSnapshotId ? snapMap.get(r.moderatorSnapshotId) || null : null,
    }));
}

export async function createBan(input: {
    guildId: string;
    subjectSnapshotId: string;
    moderatorSnapshotId: string | null;
    reason: string;
    banType: BanType;
    privateNotes?: string | null;
    expiresAt?: Date | null;
    durationMs?: number | null;
    durationToken?: string | null;
    recordExpiresAt?: Date | null;
    deleteMessageSeconds?: number | null;
    linked?: LinkedMessage | null;
    source?: string;
    discordAuditLogId?: string | null;
    pendingActionId?: string;
}): Promise<Ban> {
    const db = getDb();
    return db.transaction(async (tx) => {
        const [row] = await tx.insert(bans).values({
            guildId: input.guildId,
            subjectSnapshotId: input.subjectSnapshotId,
            moderatorSnapshotId: input.moderatorSnapshotId,
            reason: input.reason,
            banType: input.banType,
            privateNotes: input.privateNotes ?? null,
            expiresAt: input.expiresAt ?? null,
            durationMs: input.durationMs ?? null,
            durationToken: input.durationToken ?? null,
            recordExpiresAt: input.recordExpiresAt ?? null,
            deleteMessageSeconds: input.deleteMessageSeconds ?? null,
            linkedMessageId: input.linked?.linkedMessageId ?? null,
            linkedChannelId: input.linked?.linkedChannelId ?? null,
            linkedMessageUrl: input.linked?.linkedMessageUrl ?? null,
            linkedMessageDeleted: input.linked?.linkedMessageDeleted ?? false,
            source: input.source ?? 'bot',
            discordAuditLogId: input.discordAuditLogId ?? null,
        }).returning();

        const actionId = await allocateActionId(
            {
                recordType: input.banType === 'soft' ? 'softban' : 'ban',
                recordUuid: row.id,
                guildId: input.guildId,
            },
            async (value) => {
                await tx.insert(actionIds).values(value);
            },
        );
        const [withAction] = await tx.update(bans).set({ actionId }).where(eq(bans.id, row.id)).returning();
        if (input.pendingActionId) {
            await tx
                .update(pendingModerationActions)
                .set({ resultCaseId: row.id, updatedAt: new Date() })
                .where(eq(pendingModerationActions.id, input.pendingActionId));
        }
        return withAction;
    });
}

export async function listBansForUser(guildId: string, discordUserId: string): Promise<BanWithSnapshots[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(bans)
        .innerJoin(identitySnapshots, eq(bans.subjectSnapshotId, identitySnapshots.id))
        .where(and(eq(bans.guildId, guildId), eq(identitySnapshots.discordUserId, discordUserId)))
        .orderBy(desc(bans.createdAt));
    return hydrate(rows.map((r) => r.bans));
}

export async function listActiveBansForUser(guildId: string, discordUserId: string): Promise<BanWithSnapshots[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(bans)
        .innerJoin(identitySnapshots, eq(bans.subjectSnapshotId, identitySnapshots.id))
        .where(
            and(
                eq(bans.guildId, guildId),
                eq(identitySnapshots.discordUserId, discordUserId),
                isNull(bans.liftedAt),
            ),
        )
        .orderBy(desc(bans.createdAt));
    return hydrate(rows.map((r) => r.bans));
}

export async function liftBansForUser(input: {
    guildId: string;
    discordUserId: string;
    liftedByModeratorSnapshotId: string | null;
    liftReason: string;
}): Promise<Ban[]> {
    const active = await listActiveBansForUser(input.guildId, input.discordUserId);
    if (active.length === 0) return [];
    const db = getDb();
    const ids = active.map((b) => b.id);
    return db
        .update(bans)
        .set({
            liftedAt: new Date(),
            liftedByModeratorSnapshotId: input.liftedByModeratorSnapshotId,
            liftReason: input.liftReason,
        })
        .where(inArray(bans.id, ids))
        .returning();
}

/** Whether another still-effective case owns this user's live Discord ban. */
export async function hasOtherActiveBan(input: {
    guildId: string;
    discordUserId: string;
    excludingBanId: string;
    now?: Date;
}): Promise<boolean> {
    const db = getDb();
    const now = input.now ?? new Date();
    const rows = await db
        .select({ id: bans.id })
        .from(bans)
        .innerJoin(identitySnapshots, eq(bans.subjectSnapshotId, identitySnapshots.id))
        .where(
            and(
                eq(bans.guildId, input.guildId),
                eq(identitySnapshots.discordUserId, input.discordUserId),
                ne(bans.id, input.excludingBanId),
                isNull(bans.liftedAt),
                or(isNull(bans.expiresAt), gt(bans.expiresAt, now)),
            ),
        )
        .limit(1);
    return rows.length > 0;
}

export async function listExpiredOpenBans(now = new Date()): Promise<BanWithSnapshots[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(bans)
        .where(and(isNull(bans.liftedAt), isNotNull(bans.expiresAt), lte(bans.expiresAt, now)));
    return hydrate(rows);
}

export async function liftBanById(id: string, liftReason: string): Promise<Ban | null> {
    const db = getDb();
    const [row] = await db
        .update(bans)
        .set({
            liftedAt: new Date(),
            liftedByModeratorSnapshotId: null,
            liftReason,
        })
        .where(and(eq(bans.id, id), isNull(bans.liftedAt)))
        .returning();
    return row || null;
}

export async function deleteBanById(id: string, pendingActionId?: string): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
        await tx.delete(actionIds).where(eq(actionIds.recordUuid, id));
        await tx.delete(moderationActionNotifications).where(eq(moderationActionNotifications.recordUuid, id));
        await tx.delete(bans).where(eq(bans.id, id));
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
