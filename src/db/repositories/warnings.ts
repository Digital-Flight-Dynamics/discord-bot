import { and, desc, eq, gt, inArray, isNull, or, SQL } from 'drizzle-orm';
import { getDb } from '../client';
import { actionIds, identitySnapshots, pendingModerationActions, warnings, Warning } from '../schema';
import { LinkedMessage } from '../../lib/moderation';
import { allocateActionId, resolveActionId } from '../../lib/actionId';

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
    recordExpiresAt?: Date | null;
    linked?: LinkedMessage | null;
    pendingActionId?: string;
}): Promise<Warning> {
    const db = getDb();
    return db.transaction(async (tx) => {
        const [row] = await tx.insert(warnings).values({
            guildId: input.guildId,
            subjectSnapshotId: input.subjectSnapshotId,
            moderatorSnapshotId: input.moderatorSnapshotId,
            reason: input.reason,
            privateNote: input.privateNote ?? null,
            expiresAt: input.expiresAt ?? null,
            recordExpiresAt: input.recordExpiresAt ?? null,
            linkedMessageId: input.linked?.linkedMessageId ?? null,
            linkedChannelId: input.linked?.linkedChannelId ?? null,
            linkedMessageUrl: input.linked?.linkedMessageUrl ?? null,
            linkedMessageDeleted: input.linked?.linkedMessageDeleted ?? false,
        }).returning();

        const actionId = await allocateActionId(
            { recordType: 'warning', recordUuid: row.id, guildId: input.guildId },
            async (value) => {
                await tx.insert(actionIds).values(value);
            },
        );
        const [withAction] = await tx.update(warnings).set({ actionId }).where(eq(warnings.id, row.id)).returning();
        if (input.pendingActionId) {
            await tx
                .update(pendingModerationActions)
                .set({ resultCaseId: row.id, updatedAt: new Date() })
                .where(eq(pendingModerationActions.id, input.pendingActionId));
        }
        return withAction;
    });
}

function activeWarningConditions(now = new Date()): SQL {
    return and(
        isNull(warnings.removedAt),
        isNull(warnings.resolutionStatus),
        or(isNull(warnings.recordExpiresAt), gt(warnings.recordExpiresAt, now)),
    )!;
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

/**
 * Resolve a warning by its public Action ID or UUID, always scoped to `guildId`.
 */
export async function findWarningById(id: string, guildId: string): Promise<WarningWithSnapshots | null> {
    const db = getDb();

    if (!UUID_RE.test(id)) {
        const resolved = await resolveActionId(id, guildId);
        if (!resolved || resolved.recordType !== 'warning') return null;
        const rows = await db
            .select()
            .from(warnings)
            .where(and(eq(warnings.id, resolved.recordUuid), eq(warnings.guildId, guildId)))
            .limit(1);
        if (rows.length === 0) return null;
        const hydrated = await hydrateWarnings(rows);
        return hydrated[0] || null;
    }

    const rows = await db
        .select()
        .from(warnings)
        .where(and(eq(warnings.guildId, guildId), eq(warnings.id, id)))
        .limit(1);
    if (rows.length === 0) return null;
    const hydrated = await hydrateWarnings(rows);
    return hydrated[0] || null;
}

export async function softRemoveWarning(
    id: string,
    guildId: string,
    removedByModeratorSnapshotId: string | null,
): Promise<Warning | null> {
    const existing = await findWarningById(id, guildId);
    if (!existing) return null;
    if (existing.removedAt) return existing;

    const db = getDb();
    const [row] = await db
        .update(warnings)
        .set({
            removedAt: new Date(),
            removedByModeratorSnapshotId,
        })
        .where(and(eq(warnings.id, existing.id), eq(warnings.guildId, guildId)))
        .returning();
    return row;
}
