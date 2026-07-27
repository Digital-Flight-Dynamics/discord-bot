import { and, desc, eq, gt, inArray, isNull, or, SQL } from 'drizzle-orm';
import { getDb } from '../client';
import { identitySnapshots, warnings, Warning } from '../schema';
import { LinkedMessage } from '../../lib/moderation';
import { allocateActionId } from '../../lib/actionId';

export type WarningWithSnapshots = Warning & {
    subject: typeof identitySnapshots.$inferSelect;
    moderator: typeof identitySnapshots.$inferSelect | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function loadSnapshotsByIds(ids: string[]) {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return new Map<string, typeof identitySnapshots.$inferSelect>();
    const db = getDb();
    const rows = await db.select().from(identitySnapshots).where(inArray(identitySnapshots.id, unique));
    return new Map(rows.map((r) => [r.id, r]));
}

async function hydrateWarnings(rows: Warning[]): Promise<WarningWithSnapshots[]> {
    const snapMap = await loadSnapshotsByIds(
        rows.flatMap((r) => [r.subjectSnapshotId, r.moderatorSnapshotId, r.removedByModeratorSnapshotId].filter(Boolean) as string[]),
    );
    return rows.map((r) => ({
        ...r,
        subject: snapMap.get(r.subjectSnapshotId)!,
        moderator: r.moderatorSnapshotId ? snapMap.get(r.moderatorSnapshotId) || null : null,
    }));
}

export async function createWarning(input: {
    guildId: string;
    subjectSnapshotId: string;
    moderatorSnapshotId: string | null;
    reason: string;
    privateNote?: string | null;
    expiresAt?: Date | null;
    linked?: LinkedMessage | null;
    legacyMongoId?: string | null;
}): Promise<Warning> {
    const db = getDb();
    const [row] = await db
        .insert(warnings)
        .values({
            guildId: input.guildId,
            subjectSnapshotId: input.subjectSnapshotId,
            moderatorSnapshotId: input.moderatorSnapshotId,
            reason: input.reason,
            privateNote: input.privateNote ?? null,
            expiresAt: input.expiresAt ?? null,
            linkedMessageId: input.linked?.linkedMessageId ?? null,
            linkedChannelId: input.linked?.linkedChannelId ?? null,
            linkedMessageUrl: input.linked?.linkedMessageUrl ?? null,
            linkedMessageDeleted: input.linked?.linkedMessageDeleted ?? false,
            legacyMongoId: input.legacyMongoId ?? null,
        })
        .returning();

    const actionId = await allocateActionId({
        recordType: 'warning',
        recordUuid: row.id,
        guildId: input.guildId,
    });
    const [withAction] = await db
        .update(warnings)
        .set({ actionId })
        .where(eq(warnings.id, row.id))
        .returning();
    return withAction ?? { ...row, actionId };
}

function activeWarningConditions(now = new Date()): SQL {
    return and(isNull(warnings.removedAt), or(isNull(warnings.expiresAt), gt(warnings.expiresAt, now)))!;
}

export async function countActiveWarnings(guildId: string, discordUserId: string): Promise<number> {
    const db = getDb();
    const rows = await db
        .select({ id: warnings.id })
        .from(warnings)
        .innerJoin(identitySnapshots, eq(warnings.subjectSnapshotId, identitySnapshots.id))
        .where(and(eq(warnings.guildId, guildId), eq(identitySnapshots.discordUserId, discordUserId), activeWarningConditions()));
    return rows.length;
}

export async function listActiveWarnings(guildId: string, discordUserId: string): Promise<WarningWithSnapshots[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(warnings)
        .innerJoin(identitySnapshots, eq(warnings.subjectSnapshotId, identitySnapshots.id))
        .where(and(eq(warnings.guildId, guildId), eq(identitySnapshots.discordUserId, discordUserId), activeWarningConditions()))
        .orderBy(desc(warnings.createdAt));

    return hydrateWarnings(rows.map((r) => r.warnings));
}

export async function listAllWarnings(guildId: string, discordUserId: string): Promise<WarningWithSnapshots[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(warnings)
        .innerJoin(identitySnapshots, eq(warnings.subjectSnapshotId, identitySnapshots.id))
        .where(and(eq(warnings.guildId, guildId), eq(identitySnapshots.discordUserId, discordUserId)))
        .orderBy(desc(warnings.createdAt));

    return hydrateWarnings(rows.map((r) => r.warnings));
}

export async function findWarningByIdOrLegacy(id: string): Promise<WarningWithSnapshots | null> {
    const db = getDb();
    let rows: Warning[];
    if (UUID_RE.test(id)) {
        rows = await db.select().from(warnings).where(or(eq(warnings.id, id), eq(warnings.legacyMongoId, id))).limit(1);
    } else {
        rows = await db.select().from(warnings).where(eq(warnings.legacyMongoId, id)).limit(1);
    }
    if (rows.length === 0) return null;
    const hydrated = await hydrateWarnings(rows);
    return hydrated[0] || null;
}

export async function softRemoveWarning(id: string, removedByModeratorSnapshotId: string | null): Promise<Warning | null> {
    const existing = await findWarningByIdOrLegacy(id);
    if (!existing) return null;
    if (existing.removedAt) return existing;

    const db = getDb();
    const [row] = await db
        .update(warnings)
        .set({
            removedAt: new Date(),
            removedByModeratorSnapshotId,
        })
        .where(eq(warnings.id, existing.id))
        .returning();
    return row;
}
