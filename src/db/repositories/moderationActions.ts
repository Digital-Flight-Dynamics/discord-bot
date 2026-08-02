import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, type Database } from '../client';
import { findActionId } from './actionIds';
import {
    atcAppeals,
    bans,
    identitySnapshots,
    kicks,
    moderationActionAudits,
    timeouts,
    warnings,
    type ActionIdRow,
    type ModCaseType,
} from '../schema';

export type LoadedAction = {
    actionId: ActionIdRow;
    caseType: ModCaseType;
    actionName: string;
    subjectUserId: string | null;
    record: Record<string, unknown>;
};

export async function loadAction(guildId: string, actionId: string): Promise<LoadedAction | null> {
    const action = await findActionId(actionId);
    if (!action || action.guildId !== guildId) return null;
    const db = getDb();

    if (action.recordType === 'warning') {
        const rows = await db
            .select({ record: warnings, subject: identitySnapshots })
            .from(warnings)
            .innerJoin(identitySnapshots, eq(warnings.subjectSnapshotId, identitySnapshots.id))
            .where(and(eq(warnings.id, action.recordUuid), eq(warnings.guildId, guildId)))
            .limit(1);
        const row = rows[0];
        return row
            ? {
                  actionId: action,
                  caseType: 'warning',
                  actionName: 'warning',
                  subjectUserId: row.subject.discordUserId,
                  record: row.record,
              }
            : null;
    }

    if (action.recordType === 'kick') {
        const rows = await db
            .select({ record: kicks, subject: identitySnapshots })
            .from(kicks)
            .innerJoin(identitySnapshots, eq(kicks.subjectSnapshotId, identitySnapshots.id))
            .where(and(eq(kicks.id, action.recordUuid), eq(kicks.guildId, guildId)))
            .limit(1);
        const row = rows[0];
        return row ? { actionId: action, caseType: 'kick', actionName: 'kick', subjectUserId: row.subject.discordUserId, record: row.record } : null;
    }

    if (action.recordType === 'ban' || action.recordType === 'softban') {
        const rows = await db
            .select({ record: bans, subject: identitySnapshots })
            .from(bans)
            .innerJoin(identitySnapshots, eq(bans.subjectSnapshotId, identitySnapshots.id))
            .where(and(eq(bans.id, action.recordUuid), eq(bans.guildId, guildId)))
            .limit(1);
        const row = rows[0];
        const actionName = row?.record.banType === 'soft' ? 'soft-ban' : 'ban';
        return row ? { actionId: action, caseType: 'ban', actionName, subjectUserId: row.subject.discordUserId, record: row.record } : null;
    }

    if (action.recordType === 'timeout') {
        const rows = await db
            .select({ record: timeouts, subject: identitySnapshots })
            .from(timeouts)
            .innerJoin(identitySnapshots, eq(timeouts.subjectSnapshotId, identitySnapshots.id))
            .where(and(eq(timeouts.id, action.recordUuid), eq(timeouts.guildId, guildId)))
            .limit(1);
        const row = rows[0];
        return row
            ? {
                  actionId: action,
                  caseType: 'timeout',
                  actionName: 'timeout',
                  subjectUserId: row.subject.discordUserId,
                  record: row.record,
              }
            : null;
    }

    return null;
}

export type ActionUpdateExecutor = Pick<Database, 'update'>;

export type AppliedActionEdit = {
    label: string;
    oldDisplay: string | null;
    newDisplay: string;
    metadata: Record<string, unknown>;
};

export async function commitActionEdit(input: {
    loaded: LoadedAction;
    moderatorSnapshotId: string;
    moderatorUserId: string;
    rationale: string;
    notifyUser: boolean;
    notificationMode: string;
    apply: (db: ActionUpdateExecutor, loaded: LoadedAction) => Promise<AppliedActionEdit>;
}) {
    return getDb().transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.loaded.actionId.actionId}))`);
        const loaded = await loadAction(input.loaded.actionId.guildId, input.loaded.actionId.actionId);
        if (!loaded) throw new Error('Action ID not found.');
        const applied = await input.apply(tx, loaded);
        const [audit] = await tx.insert(moderationActionAudits).values({
            guildId: loaded.actionId.guildId,
            actionId: loaded.actionId.actionId,
            recordType: loaded.actionId.recordType,
            recordUuid: loaded.actionId.recordUuid,
            changeType: applied.label,
            moderatorSnapshotId: input.moderatorSnapshotId,
            moderatorUserId: input.moderatorUserId,
            oldValue: applied.oldDisplay,
            newValue: applied.newDisplay,
            rationale: input.rationale,
            notifyUser: input.notifyUser,
            metadata: { ...applied.metadata, notificationMode: input.notificationMode },
        }).returning();
        return { applied, audit, loaded };
    });
}

export async function updateActionText(
    db: ActionUpdateExecutor,
    loaded: LoadedAction,
    field: 'reason' | 'note',
    value: string,
): Promise<void> {
    const id = loaded.actionId.recordUuid;
    if (field === 'reason') {
        if (loaded.caseType === 'warning') await db.update(warnings).set({ reason: value }).where(eq(warnings.id, id));
        else if (loaded.caseType === 'kick') await db.update(kicks).set({ reason: value }).where(eq(kicks.id, id));
        else if (loaded.caseType === 'ban') await db.update(bans).set({ reason: value }).where(eq(bans.id, id));
        else await db.update(timeouts).set({ reason: value }).where(eq(timeouts.id, id));
        return;
    }
    if (loaded.caseType === 'warning') await db.update(warnings).set({ privateNote: value }).where(eq(warnings.id, id));
    else if (loaded.caseType === 'kick') await db.update(kicks).set({ privateNote: value }).where(eq(kicks.id, id));
    else if (loaded.caseType === 'ban') await db.update(bans).set({ privateNotes: value }).where(eq(bans.id, id));
    else await db.update(timeouts).set({ privateNote: value }).where(eq(timeouts.id, id));
}

export async function updateBanExpiration(db: ActionUpdateExecutor, id: string, expiresAt: Date | null): Promise<void> {
    await db.update(bans).set({ expiresAt }).where(eq(bans.id, id));
}

export async function updateActionRecordExpiration(
    db: ActionUpdateExecutor,
    loaded: LoadedAction,
    recordExpiresAt: Date | null,
): Promise<void> {
    const id = loaded.actionId.recordUuid;
    if (loaded.caseType === 'warning') await db.update(warnings).set({ recordExpiresAt }).where(eq(warnings.id, id));
    else if (loaded.caseType === 'kick') await db.update(kicks).set({ recordExpiresAt }).where(eq(kicks.id, id));
    else if (loaded.caseType === 'ban') await db.update(bans).set({ recordExpiresAt }).where(eq(bans.id, id));
    else await db.update(timeouts).set({ recordExpiresAt }).where(eq(timeouts.id, id));
}

export async function updateTimeoutDuration(
    db: ActionUpdateExecutor,
    id: string,
    durationMs: number,
    durationToken: string,
    expiresAt: Date,
): Promise<void> {
    await db.update(timeouts).set({ durationMs, durationToken, expiresAt }).where(eq(timeouts.id, id));
}

export async function updateBanPurgeDuration(db: ActionUpdateExecutor, id: string, seconds: number): Promise<void> {
    await db.update(bans).set({ deleteMessageSeconds: seconds }).where(eq(bans.id, id));
}

export async function commitActionResolution<Effect>(input: {
    loaded: LoadedAction;
    status: 'revoked' | 'appeal-approved';
    reason: string;
    publicNote: string | null;
    moderatorSnapshotId: string;
    moderatorUserId: string;
    label: string;
    appealId?: string | null;
    applyDiscord: () => Promise<Effect>;
    effectMetadata: (effect: Effect) => Record<string, unknown>;
}) {
    const resolvedAt = new Date();
    const resolution = {
        resolutionStatus: input.status,
        resolvedAt,
        resolvedByModeratorSnapshotId: input.moderatorSnapshotId,
        resolutionReason: input.reason,
        resolutionPublicNote: input.publicNote,
    };
    return getDb().transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.loaded.actionId.actionId}))`);
        const id = input.loaded.actionId.recordUuid;
        let updated: unknown;
        if (input.loaded.caseType === 'warning') {
            [updated] = await tx
                .update(warnings)
                .set({ ...resolution, removedAt: resolvedAt, removedByModeratorSnapshotId: input.moderatorSnapshotId })
                .where(and(eq(warnings.id, id), isNull(warnings.resolutionStatus)))
                .returning();
        } else if (input.loaded.caseType === 'kick') {
            [updated] = await tx.update(kicks).set(resolution).where(and(eq(kicks.id, id), isNull(kicks.resolutionStatus))).returning();
        } else if (input.loaded.caseType === 'ban') {
            [updated] = await tx
                .update(bans)
                .set({
                    ...resolution,
                    liftedAt: resolvedAt,
                    liftedByModeratorSnapshotId: input.moderatorSnapshotId,
                    liftReason: `${input.label}: ${input.reason}`,
                })
                .where(and(eq(bans.id, id), isNull(bans.resolutionStatus)))
                .returning();
        } else {
            [updated] = await tx
                .update(timeouts)
                .set(resolution)
                .where(and(eq(timeouts.id, id), isNull(timeouts.resolutionStatus)))
                .returning();
        }
        if (!updated) throw new Error('This action was resolved by another moderator.');

        if (input.status === 'appeal-approved') {
            if (!input.appealId) throw new Error('An appeal ID is required when approving an appeal.');
            const [appeal] = await tx
                .update(atcAppeals)
                .set({
                    status: 'approved',
                    decidedAt: resolvedAt,
                    decidedByDiscordUserId: input.moderatorUserId,
                    decisionNote: input.publicNote,
                })
                .where(and(
                    eq(atcAppeals.id, input.appealId),
                    eq(atcAppeals.guildId, input.loaded.actionId.guildId),
                    sql`upper(${atcAppeals.actionId}) = upper(${input.loaded.actionId.actionId})`,
                    inArray(atcAppeals.status, ['submitted', 'review']),
                ))
                .returning({ id: atcAppeals.id });
            if (!appeal) throw new Error('Appeal not found, already decided, or not attached to this action.');
        }

        const effect = await input.applyDiscord();
        const [audit] = await tx.insert(moderationActionAudits).values({
            guildId: input.loaded.actionId.guildId,
            actionId: input.loaded.actionId.actionId,
            recordType: input.loaded.actionId.recordType,
            recordUuid: input.loaded.actionId.recordUuid,
            changeType: input.label,
            moderatorSnapshotId: input.moderatorSnapshotId,
            moderatorUserId: input.moderatorUserId,
            oldValue: null,
            newValue: input.label,
            rationale: input.reason,
            notifyUser: true,
            metadata: {
                resolutionStatus: input.status,
                publicNote: input.publicNote,
                appealId: input.appealId ?? null,
                notificationMode: 'silent-edit',
                ...input.effectMetadata(effect),
            },
        }).returning();
        return { audit, effect };
    });
}
