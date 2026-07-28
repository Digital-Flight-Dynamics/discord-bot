import { and, desc, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { getDb } from '../client';
import { bans, Ban, BanType, identitySnapshots } from '../schema';
import { LinkedMessage } from '../../lib/moderation';
import { allocateActionId } from '../../lib/actionId';

export type BanWithSnapshots = Ban & {
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

async function hydrate(rows: Ban[]): Promise<BanWithSnapshots[]> {
    const snapMap = await loadSnapshotsByIds(
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
    deleteMessageSeconds?: number | null;
    linked?: LinkedMessage | null;
    source?: string;
}): Promise<Ban> {
    const db = getDb();
    const [row] = await db
        .insert(bans)
        .values({
            guildId: input.guildId,
            subjectSnapshotId: input.subjectSnapshotId,
            moderatorSnapshotId: input.moderatorSnapshotId,
            reason: input.reason,
            banType: input.banType,
            privateNotes: input.privateNotes ?? null,
            expiresAt: input.expiresAt ?? null,
            deleteMessageSeconds: input.deleteMessageSeconds ?? null,
            linkedMessageId: input.linked?.linkedMessageId ?? null,
            linkedChannelId: input.linked?.linkedChannelId ?? null,
            linkedMessageUrl: input.linked?.linkedMessageUrl ?? null,
            linkedMessageDeleted: input.linked?.linkedMessageDeleted ?? false,
            source: input.source ?? 'bot',
        })
        .returning();

    const actionId = await allocateActionId({
        recordType: input.banType === 'soft' ? 'softban' : 'ban',
        recordUuid: row.id,
        guildId: input.guildId,
    });
    const [withAction] = await db
        .update(bans)
        .set({ actionId })
        .where(eq(bans.id, row.id))
        .returning();
    return withAction ?? { ...row, actionId };
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
