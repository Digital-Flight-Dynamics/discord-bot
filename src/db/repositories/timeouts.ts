import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { identitySnapshots, timeouts, Timeout } from '../schema';
import { allocateActionId } from '../../lib/actionId';

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
}): Promise<Timeout> {
    const db = getDb();
    const [row] = await db
        .insert(timeouts)
        .values({
            guildId: input.guildId,
            subjectSnapshotId: input.subjectSnapshotId,
            moderatorSnapshotId: input.moderatorSnapshotId,
            reason: input.reason,
            privateNote: input.privateNote ?? null,
            durationMs: input.durationMs,
            durationToken: input.durationToken ?? null,
            expiresAt: input.expiresAt ?? null,
            source: input.source ?? 'bot',
        })
        .returning();

    const actionId = await allocateActionId({
        recordType: 'timeout',
        recordUuid: row.id,
        guildId: input.guildId,
    });
    const [withAction] = await db
        .update(timeouts)
        .set({ actionId })
        .where(eq(timeouts.id, row.id))
        .returning();
    return withAction ?? { ...row, actionId };
}

export async function countTimeoutsForUser(guildId: string, discordUserId: string): Promise<number> {
    const db = getDb();
    const rows = await db
        .select({ id: timeouts.id })
        .from(timeouts)
        .innerJoin(identitySnapshots, eq(timeouts.subjectSnapshotId, identitySnapshots.id))
        .where(and(eq(timeouts.guildId, guildId), eq(identitySnapshots.discordUserId, discordUserId)));
    return rows.length;
}

export async function listTimeoutsForUser(guildId: string, discordUserId: string): Promise<Timeout[]> {
    const db = getDb();
    const rows = await db
        .select({ timeout: timeouts })
        .from(timeouts)
        .innerJoin(identitySnapshots, eq(timeouts.subjectSnapshotId, identitySnapshots.id))
        .where(and(eq(timeouts.guildId, guildId), eq(identitySnapshots.discordUserId, discordUserId)))
        .orderBy(desc(timeouts.createdAt));
    return rows.map((r) => r.timeout);
}
