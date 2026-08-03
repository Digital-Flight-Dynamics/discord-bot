import { desc, eq } from 'drizzle-orm';
import { getDb } from '../client';
import {
    identitySnapshots,
    moderationActionAudits,
    type IdentitySnapshot,
    type ModerationActionAudit,
    type NewModerationActionAudit,
} from '../schema';

export type ModerationActionAuditWithModerator = ModerationActionAudit & {
    moderator: IdentitySnapshot | null;
};

export async function createModerationActionAudit(input: NewModerationActionAudit): Promise<ModerationActionAudit> {
    const db = getDb();
    const [row] = await db.insert(moderationActionAudits).values(input).returning();
    return row;
}

export async function listModerationActionAudits(actionId: string): Promise<ModerationActionAuditWithModerator[]> {
    const db = getDb();
    const rows = await db
        .select({ audit: moderationActionAudits, moderator: identitySnapshots })
        .from(moderationActionAudits)
        .leftJoin(identitySnapshots, eq(moderationActionAudits.moderatorSnapshotId, identitySnapshots.id))
        .where(eq(moderationActionAudits.actionId, actionId))
        .orderBy(desc(moderationActionAudits.createdAt));
    return rows.map((row) => ({ ...row.audit, moderator: row.moderator }));
}

export async function updateModerationActionAuditMetadata(
    id: string,
    metadata: Record<string, unknown>,
): Promise<ModerationActionAudit | null> {
    const db = getDb();
    const [row] = await db
        .update(moderationActionAudits)
        .set({ metadata })
        .where(eq(moderationActionAudits.id, id))
        .returning();
    return row ?? null;
}
