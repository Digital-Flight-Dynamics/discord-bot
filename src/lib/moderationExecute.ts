import { Client, Guild, GuildMember, User } from 'discord.js';
import { EmbedColors } from './embed';
import {
    getInfractionCounts,
    modLogMessageUrl,
    modPortalUrl,
    discordAuditReason,
} from './moderationFormat';
import { logModerationAction, tryDmUser, type DmResult } from './moderationNotify';
import { captureIdentitySnapshot } from '../db/repositories/snapshots';
import { createWarning, countActiveWarnings } from '../db/repositories/warnings';
import { createKick, deleteKickById } from '../db/repositories/kicks';
import { createBan, deleteBanById, liftBanById } from '../db/repositories/bans';
import { createTimeout, deleteTimeoutById } from '../db/repositories/timeouts';
import {
    claimPendingModeration,
    getPendingModerationById,
    markPendingCancelled,
    markPendingCompleted,
    markPendingDiscordApplied,
    markPendingFailed,
} from '../db/repositories/pendingModeration';
import type { PendingModerationAction } from '../db/schema';
import type { LinkedMessage } from './moderation';
import { moderationTextForEmbed } from './moderationLimits';
import { findActionIdByRecord } from '../db/repositories/actionIds';
import { formatDurationMs, MAX_DISCORD_TIMEOUT_MS } from './moderationDuration';
import {
    buildModLogFields,
    storeActionDm,
    timeoutUserDmEmbed,
    userActionDmEmbed,
} from './moderationExecutionPresentation';

export type ModerationExecutionResult =
    | { status: 'completed' | 'partial'; actionId: string; modLogUrl: string | null; notice?: string }
    | { status: 'not-executed'; reason: string };

function linkedFromPending(p: PendingModerationAction): LinkedMessage | null {
    if (!p.linkedMessageId || !p.linkedChannelId) return null;
    return {
        linkedMessageId: p.linkedMessageId,
        linkedChannelId: p.linkedChannelId,
        linkedMessageUrl: p.linkedMessageUrl || `https://discord.com/channels/${p.guildId}/${p.linkedChannelId}/${p.linkedMessageId}`,
        linkedMessageDeleted: false,
    };
}

/**
 * Apply a pending moderation action (after confirm, timeout, or restart recovery).
 */
export async function executePendingModeration(
    client: Client,
    pending: PendingModerationAction,
    opts?: {
        privateNote?: string | null;
        timedOut?: boolean;
        preActionDm?: DmResult;
    },
): Promise<ModerationExecutionResult> {
    // Atomically claim the row so concurrent workers / a crash-then-restart replay
    // cannot both execute the same pending action.
    const claimed = await claimPendingModeration(pending.id);
    if (!claimed) {
        return { status: 'not-executed', reason: 'Action was already claimed or completed.' };
    }
    pending = claimed;

    if (pending.resultCaseId) {
        const action = await findActionIdByRecord(pending.resultCaseId, pending.guildId);
        await markPendingCompleted(pending.id, pending.resultCaseId);
        const applied = pending.actionType === 'warn' || Boolean(pending.discordAppliedAt);
        return {
            status: 'partial',
            actionId: action?.actionId || pending.resultCaseId,
            modLogUrl: null,
            notice: applied
                ? 'The action was already applied before restart and was not executed again.'
                : 'The case was created before restart, but Discord application is uncertain. It was not repeated; staff reconciliation is required.',
        };
    }

    const storedPrivateNote = pending.privateNote && pending.privateNote !== 'None' ? pending.privateNote : null;
    const privateNote = opts?.privateNote !== undefined ? opts.privateNote : storedPrivateNote;
    const noteDisplay = privateNote || (opts?.timedOut ? 'None (auto — no response)' : 'None');
    const timedOut = Boolean(opts?.timedOut);
    let automation: string | null = null;
    if (pending.moderatorUserId === client.user?.id) {
        automation = typeof pending.payload.automation === 'string'
            ? pending.payload.automation
            : 'Automated moderation';
    }

    const guild = client.guilds.cache.get(pending.guildId) || (await client.guilds.fetch(pending.guildId).catch(() => null));
    if (!guild) {
        console.error(`[ERROR] Pending mod ${pending.id}: guild ${pending.guildId} not available`);
        await markPendingFailed(pending.id);
        return { status: 'not-executed', reason: 'Guild unavailable.' };
    }

    const member: GuildMember | null = await guild.members.fetch(pending.subjectUserId).catch(() => null);
    let subjectUser: User | null = member?.user || null;
    if (!subjectUser) {
        subjectUser = await client.users.fetch(pending.subjectUserId).catch(() => null);
    }
    if (!subjectUser) {
        console.error(`[ERROR] Pending mod ${pending.id}: subject user not found`);
        await markPendingCancelled(pending.id);
        return { status: 'not-executed', reason: 'Subject user unavailable.' };
    }

    const moderatorMember = await guild.members.fetch(pending.moderatorUserId).catch(() => null);
    const moderatorUser =
        moderatorMember?.user || (await client.users.fetch(pending.moderatorUserId).catch(() => null));

    const linked = linkedFromPending(pending);

    try {
        switch (pending.actionType) {
            case 'warn':
                return executeWarn(guild, pending, {
                    member,
                    subjectUser,
                    moderatorMember,
                    moderatorUser,
                    privateNote,
                    noteDisplay,
                    timedOut,
                    linked,
                    automation,
                });
            case 'kick':
                return executeKick(guild, pending, {
                    member,
                    subjectUser,
                    moderatorMember,
                    moderatorUser,
                    privateNote,
                    noteDisplay,
                    timedOut,
                    linked,
                    automation,
                });
            case 'ban':
                return executeBan(guild, pending, {
                    member,
                    subjectUser,
                    moderatorMember,
                    moderatorUser,
                    privateNote,
                    noteDisplay,
                    timedOut,
                    linked,
                    soft: pending.banType === 'soft',
                    dmOverride: opts?.preActionDm,
                    automation,
                });
            case 'timeout':
                return executeTimeout(guild, pending, {
                    member,
                    subjectUser,
                    moderatorMember,
                    moderatorUser,
                    privateNote,
                    noteDisplay,
                    timedOut,
                    automation,
                });
            default:
                console.error(`[ERROR] Unknown pending action type: ${pending.actionType}`);
                await markPendingCancelled(pending.id);
                return { status: 'not-executed', reason: 'Unknown action type.' };
        }
    } catch (err) {
        console.error(`[ERROR] Failed to execute pending ${pending.id}:`, err);
        const current = await getPendingModerationById(pending.id).catch(() => null);
        if (current?.resultCaseId && (current.actionType === 'warn' || current.discordAppliedAt || pending.discordAppliedAt)) {
            await markPendingCompleted(pending.id, current.resultCaseId);
            return {
                status: 'partial',
                actionId: current.resultCaseId,
                modLogUrl: null,
                notice: 'The action was applied, but a follow-up update failed.',
            };
        }
        if (current?.resultCaseId) {
            await markPendingFailed(pending.id);
            const action = await findActionIdByRecord(current.resultCaseId, current.guildId).catch(() => null);
            return {
                status: 'partial',
                actionId: action?.actionId || current.resultCaseId,
                modLogUrl: null,
                notice: 'Discord rejected the action and automatic case cleanup failed. The case requires manual reconciliation.',
            };
        }
        await markPendingFailed(pending.id);
        return { status: 'not-executed', reason: 'Discord rejected the action.' };
    }
}

type ExecCtx = {
    member: GuildMember | null;
    subjectUser: User;
    moderatorMember: GuildMember | null;
    moderatorUser: User | null;
    privateNote: string | null;
    noteDisplay: string;
    timedOut: boolean;
    linked?: LinkedMessage | null;
    dmOverride?: DmResult;
    automation?: string | null;
};

async function executeWarn(
    guild: Guild,
    pending: PendingModerationAction,
    ctx: ExecCtx,
): Promise<ModerationExecutionResult> {
    const activeBefore = await countActiveWarnings(guild.id, pending.subjectUserId);
    const newWarnCount = activeBefore + 1;

    const subjectSnap = await captureIdentitySnapshot({
        member: ctx.member || undefined,
        user: ctx.subjectUser,
    });
    const moderatorSnap = await captureIdentitySnapshot({
        member: ctx.moderatorMember || undefined,
        user: ctx.moderatorUser || undefined,
        discordUserId: pending.moderatorUserId,
    });

    const warning = await createWarning({
        guildId: guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap.id,
        reason: pending.reason,
        privateNote: ctx.privateNote,
        expiresAt: null,
        recordExpiresAt: pending.recordExpiresAt,
        linked: ctx.linked,
        pendingActionId: pending.id,
    });
    const recordExpiresAt = pending.recordExpiresAt;

    const counts = await getInfractionCounts(guild.id, pending.subjectUserId);
    const publicId = warning.actionId || warning.id;
    const dm = await tryDmUser(ctx.subjectUser, {
        embeds: [
            userActionDmEmbed({
                guild,
                color: EmbedColors.WARNING,
                actionPast: 'warned',
                actionName: 'warning',
                actionId: publicId,
                reason: pending.reason,
                expiresAt: recordExpiresAt,
                infractionNumber: counts.warningsTotal,
            }),
        ],
    });
    await storeActionDm({
        guildId: guild.id,
        actionId: publicId,
        recordType: 'warning',
        recordUuid: warning.id,
        userId: pending.subjectUserId,
        dm,
    });
    const modLog = await logModerationAction(guild, {
        color: EmbedColors.WARNING,
        caseType: 'warning',
        caseId: warning.id,
        actionId: publicId,
        subjectUserId: pending.subjectUserId,
        subjectTag: ctx.subjectUser.tag,
        moderatorId: pending.moderatorUserId,
        description: `<@${pending.subjectUserId}> has been **warned**. Action ID \`#${publicId}\``,
        fields: buildModLogFields({
            action: 'warning',
            subjectMember: ctx.member,
            subjectUser: ctx.subjectUser,
            subjectSnap,
            moderatorMember: ctx.moderatorMember,
            moderatorUser: ctx.moderatorUser,
            moderatorSnap,
            counts,
            thisNth: newWarnCount,
            dm,
            expiresAt: recordExpiresAt,
            durationToken: pending.durationToken,
            reason: pending.reason,
            privateNote: ctx.noteDisplay,
            actionId: publicId,
            automation: ctx.automation,
        }),
        footerUrl: modPortalUrl(publicId),
    });

    await markPendingCompleted(pending.id, warning.id);
    return {
        status: 'completed',
        actionId: publicId,
        modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
    };
}

async function executeKick(
    guild: Guild,
    pending: PendingModerationAction,
    ctx: ExecCtx,
): Promise<ModerationExecutionResult> {
    const subjectSnap = await captureIdentitySnapshot({
        member: ctx.member || undefined,
        user: ctx.subjectUser,
    });
    const moderatorSnap = await captureIdentitySnapshot({
        member: ctx.moderatorMember || undefined,
        user: ctx.moderatorUser || undefined,
        discordUserId: pending.moderatorUserId,
    });

    if (!ctx.member?.kickable) {
        throw new Error(`Cannot kick ${pending.subjectUserId} in guild ${guild.id}: member not kickable`);
    }
    const row = await createKick({
        guildId: guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap.id,
        reason: pending.reason,
        privateNote: ctx.privateNote,
        recordExpiresAt: pending.recordExpiresAt,
        linked: ctx.linked,
        isAutomated: false,
        source: ctx.automation ? ctx.automation.toLowerCase() : 'bot',
        pendingActionId: pending.id,
    });
    const publicId = row.actionId || row.id;
    const counts = await getInfractionCounts(guild.id, pending.subjectUserId);
    // Notify while the member is still in the guild, before Discord removes them.
    const dm = await tryDmUser(ctx.subjectUser, {
        embeds: [
            userActionDmEmbed({
                guild,
                color: EmbedColors.WARNING,
                actionPast: 'kicked',
                actionName: 'kick',
                actionId: publicId,
                reason: pending.reason,
                infractionNumber: counts.kicks,
            }),
        ],
    });
    await storeActionDm({
        guildId: guild.id,
        actionId: publicId,
        recordType: 'kick',
        recordUuid: row.id,
        userId: pending.subjectUserId,
        dm,
    });
    try {
        await ctx.member.kick(
            discordAuditReason(
                publicId,
                ctx.moderatorUser?.username || 'Unknown',
                pending.moderatorUserId,
                pending.reason,
            ),
        );
    } catch (err) {
        await deleteKickById(row.id, pending.id).catch(console.error);
        await sendFailedActionCorrection(ctx.subjectUser, 'kick').catch(console.error);
        throw err;
    }
    pending.discordAppliedAt = new Date();
    await markPendingDiscordApplied(pending.id);

    const modLog = await logModerationAction(guild, {
        color: EmbedColors.WARNING,
        caseType: 'kick',
        caseId: row.id,
        actionId: publicId,
        subjectUserId: pending.subjectUserId,
        subjectTag: ctx.subjectUser.tag,
        moderatorId: pending.moderatorUserId,
        description: `<@${pending.subjectUserId}> has been **kicked**. Action ID \`#${publicId}\``,
        fields: buildModLogFields({
            action: 'kick',
            subjectMember: ctx.member,
            subjectUser: ctx.subjectUser,
            subjectSnap,
            moderatorMember: ctx.moderatorMember,
            moderatorUser: ctx.moderatorUser,
            moderatorSnap,
            counts,
            thisNth: counts.kicks,
            dm,
            reason: pending.reason,
            privateNote: ctx.noteDisplay,
            actionId: publicId,
            automation: ctx.automation,
        }),
        footerUrl: modPortalUrl(publicId),
    });

    await markPendingCompleted(pending.id, row.id);
    return {
        status: 'completed',
        actionId: publicId,
        modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
    };
}

async function executeBan(
    guild: Guild,
    pending: PendingModerationAction,
    ctx: ExecCtx & { soft: boolean },
): Promise<ModerationExecutionResult> {
    const subjectSnap = await captureIdentitySnapshot({
        member: ctx.member || undefined,
        user: ctx.subjectUser,
        discordUserId: pending.subjectUserId,
        username: ctx.subjectUser.username,
    });
    const moderatorSnap = await captureIdentitySnapshot({
        member: ctx.moderatorMember || undefined,
        user: ctx.moderatorUser || undefined,
        discordUserId: pending.moderatorUserId,
    });

    const row = await createBan({
        guildId: guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap.id,
        reason: pending.reason,
        banType: ctx.soft ? 'soft' : 'hard',
        privateNotes: ctx.privateNote,
        expiresAt: pending.expiresAt,
        recordExpiresAt: pending.recordExpiresAt,
        deleteMessageSeconds: pending.deleteMessageSeconds,
        linked: ctx.linked,
        source: ctx.automation ? ctx.automation.toLowerCase() : 'bot',
        pendingActionId: pending.id,
    });
    const publicId = row.actionId || row.id;
    const counts = await getInfractionCounts(guild.id, pending.subjectUserId);
    // Use a caller-provided pre-action DM (honeypot), otherwise notify before banning.
    const dm =
        ctx.dmOverride ??
        (await tryDmUser(ctx.subjectUser, {
            embeds: [
                userActionDmEmbed({
                    guild,
                    color: EmbedColors.FAILURE,
                    actionPast: ctx.soft ? 'soft-banned' : 'banned',
                    actionName: 'ban',
                    actionId: publicId,
                    reason: pending.reason,
                    expiresAt: pending.expiresAt,
                    infractionNumber: counts.bans,
                }),
            ],
        }));
    await storeActionDm({
        guildId: guild.id,
        actionId: publicId,
        recordType: ctx.soft ? 'softban' : 'ban',
        recordUuid: row.id,
        userId: pending.subjectUserId,
        dm,
    });
    const auditReason = discordAuditReason(
        publicId,
        ctx.moderatorUser?.username || 'Unknown',
        pending.moderatorUserId,
        pending.reason,
    );
    try {
        await guild.members.ban(pending.subjectUserId, {
            deleteMessageSeconds: pending.deleteMessageSeconds || 0,
            reason: auditReason,
        });
    } catch (err) {
        await deleteBanById(row.id, pending.id).catch(console.error);
        await sendFailedActionCorrection(ctx.subjectUser, ctx.soft ? 'soft-ban' : 'ban').catch(console.error);
        throw err;
    }

    let softUnbanned = false;
    if (ctx.soft) {
        try {
            await guild.members.unban(pending.subjectUserId, auditReason);
            softUnbanned = true;
        } catch (err) {
            console.error(`[ERROR] Soft-ban follow-up unban failed for ${pending.subjectUserId} in guild ${guild.id}:`, err);
        }
    }
    pending.discordAppliedAt = new Date();
    await markPendingDiscordApplied(pending.id);
    if (ctx.soft && !softUnbanned) {
        const modLog = await logModerationAction(guild, {
            color: EmbedColors.FAILURE,
            title: 'Soft-ban follow-up failed',
            caseType: 'ban',
            caseId: row.id,
            actionId: publicId,
            subjectUserId: pending.subjectUserId,
            subjectTag: ctx.subjectUser.tag,
            moderatorId: pending.moderatorUserId,
            fields: [
                { name: 'Status', value: 'The ban succeeded, but Discord rejected the follow-up unban. The user remains banned.', inline: false },
                { name: 'Reason', value: moderationTextForEmbed(pending.reason, publicId), inline: false },
            ],
            footerUrl: modPortalUrl(publicId),
        });
        await markPendingCompleted(pending.id, row.id);
        return {
            status: 'partial',
            actionId: publicId,
            modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
            notice: 'Soft-ban follow-up unban failed; the user remains banned and requires manual reconciliation.',
        };
    }
    if (softUnbanned) await liftBanById(row.id, 'soft-ban completed');

    const modLog = await logModerationAction(guild, {
        color: EmbedColors.FAILURE,
        caseType: 'ban',
        caseId: row.id,
        actionId: publicId,
        subjectUserId: pending.subjectUserId,
        subjectTag: ctx.subjectUser.tag,
        moderatorId: pending.moderatorUserId,
        description: `<@${pending.subjectUserId}> has been **${ctx.soft ? 'soft-banned' : 'banned'}**. Action ID \`#${publicId}\``,
        fields: buildModLogFields({
            action: 'ban',
            subjectMember: ctx.member,
            subjectUser: ctx.subjectUser,
            subjectSnap,
            moderatorMember: ctx.moderatorMember,
            moderatorUser: ctx.moderatorUser,
            moderatorSnap,
            counts,
            thisNth: counts.bans,
            dm,
            expiresAt: pending.expiresAt,
            durationToken: pending.durationToken,
            reason: pending.reason,
            privateNote: ctx.noteDisplay,
            actionId: publicId,
            automation: ctx.automation,
        }),
        footerUrl: modPortalUrl(publicId),
    });

    await markPendingCompleted(pending.id, row.id);
    return {
        status: 'completed',
        actionId: publicId,
        modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
    };
}

async function sendFailedActionCorrection(user: User, action: string): Promise<void> {
    await tryDmUser(user, {
        content:
            `Correction: the ${action} notification you just received was sent before Discord processed the action. ` +
            'Discord rejected it, so that action was not applied.',
    });
}

async function executeTimeout(
    guild: Guild,
    pending: PendingModerationAction,
    ctx: Omit<ExecCtx, 'linked'>,
): Promise<ModerationExecutionResult> {
    const requestedDurationMs = pending.durationMs || 0;
    const durationMs = Math.min(requestedDurationMs, MAX_DISCORD_TIMEOUT_MS);
    const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;

    const subjectSnap = await captureIdentitySnapshot({
        member: ctx.member || undefined,
        user: ctx.subjectUser,
    });
    const moderatorSnap = await captureIdentitySnapshot({
        member: ctx.moderatorMember || undefined,
        user: ctx.moderatorUser || undefined,
        discordUserId: pending.moderatorUserId,
    });

    const discordTimeoutMs = durationMs;
    const timeoutClamped = requestedDurationMs > MAX_DISCORD_TIMEOUT_MS;
    const durationToken = timeoutClamped ? formatDurationMs(MAX_DISCORD_TIMEOUT_MS) : pending.durationToken;
    if (!ctx.member?.manageable) {
        throw new Error(`Cannot time out ${pending.subjectUserId} in guild ${guild.id}: member not manageable`);
    }
    const row = await createTimeout({
        guildId: guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap.id,
        reason: pending.reason,
        privateNote: ctx.privateNote,
        durationMs,
        durationToken,
        expiresAt,
        recordExpiresAt: pending.recordExpiresAt,
        source: ctx.automation ? ctx.automation.toLowerCase() : 'bot',
        pendingActionId: pending.id,
    });
    const publicId = row.actionId || row.id;
    if (discordTimeoutMs > 0) {
        try {
            await ctx.member.timeout(
                discordTimeoutMs,
                discordAuditReason(
                    publicId,
                    ctx.moderatorUser?.username || 'Unknown',
                    pending.moderatorUserId,
                    pending.reason,
                ),
            );
        } catch (err) {
            await deleteTimeoutById(row.id, pending.id).catch(console.error);
            throw err;
        }
    }
    pending.discordAppliedAt = new Date();
    await markPendingDiscordApplied(pending.id);


    const counts = await getInfractionCounts(guild.id, pending.subjectUserId);

    if (!expiresAt) throw new Error('Timeout requires an expiration.');
    const dm = await tryDmUser(ctx.subjectUser, {
        embeds: [
            timeoutUserDmEmbed({
                guild,
                actionId: publicId,
                reason: pending.reason,
                expiresAt,
            }),
        ],
    });
    await storeActionDm({
        guildId: guild.id,
        actionId: publicId,
        recordType: 'timeout',
        recordUuid: row.id,
        userId: pending.subjectUserId,
        dm,
    });

    const modLog = await logModerationAction(guild, {
        color: EmbedColors.WARNING,
        caseType: 'timeout',
        caseId: row.id,
        actionId: publicId,
        subjectUserId: pending.subjectUserId,
        subjectTag: ctx.subjectUser.tag,
        moderatorId: pending.moderatorUserId,
        description: `<@${pending.subjectUserId}> has been **muted** (timeout). Action ID \`#${publicId}\``,
        fields: buildModLogFields({
            action: 'timeout',
            subjectMember: ctx.member,
            subjectUser: ctx.subjectUser,
            subjectSnap,
            moderatorMember: ctx.moderatorMember,
            moderatorUser: ctx.moderatorUser,
            moderatorSnap,
            counts,
            thisNth: counts.mutes,
            dm,
            expiresAt,
            durationToken,
            reason: pending.reason,
            privateNote: ctx.noteDisplay,
            actionId: publicId,
            automation: ctx.automation,
        }),
        footerUrl: modPortalUrl(publicId),
    });

    await markPendingCompleted(pending.id, row.id);
    return {
        status: 'completed',
        actionId: publicId,
        modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
        notice: timeoutClamped
            ? ':warning: Could not time out for the requested duration; it exceeds Discord limits. ' +
              `Timed out for ${formatDurationMs(MAX_DISCORD_TIMEOUT_MS)}.`
            : undefined,
    };
}

/** Resume stale pending actions after restart (no private note). */
export async function resumeStalePendingModeration(client: Client): Promise<void> {
    const { listStalePendingModerationActions, requeueProcessingPendingModeration } = await import('../db/repositories/pendingModeration');
    const stale = await listStalePendingModerationActions(3_000);
    if (stale.length === 0) return;
    console.log(`[mod] Resuming ${stale.length} pending moderation action(s) without private notes`);
    for (const p of stale) {
        const pending = p.status === 'processing' ? await requeueProcessingPendingModeration(p.id) : p;
        if (pending) await executePendingModeration(client, pending, { privateNote: null, timedOut: true });
    }
}
