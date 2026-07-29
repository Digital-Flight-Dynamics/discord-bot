import { APIEmbedField, Client, Guild, GuildMember, TextChannel, User } from 'discord.js';
import { createEmbed, EmbedColors, resultEmbedColor } from './embed';
import {
    formatInfractionCountLine,
    formatModeratorBlock,
    formatUserInformationBlock,
    getInfractionCounts,
    formatOrdinal,
    appealUrl,
    modLogMessageUrl,
    modPortalUrl,
    notifiedLine,
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
    markPendingFailed,
} from '../db/repositories/pendingModeration';
import { createModerationActionNotification } from '../db/repositories/moderationActionNotifications';
import type { PendingModerationAction } from '../db/schema';
import type { LinkedMessage } from './moderation';
import { channels } from '../config';

export type ModerationExecutionResult = { actionId: string; modLogUrl: string | null; notice?: string } | null;
const MAX_DISCORD_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function linkedFromPending(p: PendingModerationAction): LinkedMessage | null {
    if (!p.linkedMessageId || !p.linkedChannelId) return null;
    return {
        linkedMessageId: p.linkedMessageId,
        linkedChannelId: p.linkedChannelId,
        linkedMessageUrl: p.linkedMessageUrl || `https://discord.com/channels/${p.guildId}/${p.linkedChannelId}/${p.linkedMessageId}`,
        linkedMessageDeleted: false,
    };
}

async function editConfirm(
    client: Client,
    p: PendingModerationAction,
    embed: ReturnType<typeof createEmbed>,
): Promise<void> {
    if (!p.confirmChannelId || !p.confirmMessageId) return;
    try {
        const ch = await client.channels.fetch(p.confirmChannelId).catch(() => null);
        if (!ch || !ch.isTextBased() || ch.isDMBased()) return;
        const msg = await ch.messages.fetch(p.confirmMessageId).catch(() => null);
        if (!msg) return;
        await msg.edit({ embeds: [embed], components: [] }).catch(console.error);
    } catch (err) {
        console.error('[ERROR] Failed to edit confirm message:', err);
    }
}

function commandConfirmEmbed(opts: {
    actionPast: string;
    subjectId: string;
    /** Public Action ID (A26…) */
    actionId: string;
    modLogUrl: string | null;
    timedOut?: boolean;
    partial?: boolean;
}) {
    return createEmbed({
        color: resultEmbedColor({ timedOut: opts.timedOut, partial: opts.partial }),
        description:
            `***<@${opts.subjectId}> has been ${opts.actionPast}***.` +
            (opts.modLogUrl ? `\n-# [Go to mod log](${opts.modLogUrl})` : ''),
    });
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
        cancelled?: boolean;
        preActionDm?: DmResult;
    },
): Promise<ModerationExecutionResult> {
    if (opts?.cancelled) {
        const current = (await getPendingModerationById(pending.id).catch(() => null)) || pending;
        if (current.status !== 'pending') return null;
        pending = current;
        await markPendingCancelled(pending.id);
        await editConfirm(
            client,
            pending,
            createEmbed({
                color: EmbedColors.WARNING,
                title: 'Action cancelled',
                description: 'No action was taken.',
            }),
        );
        return null;
    }

    // Atomically claim the row so concurrent workers / a crash-then-restart replay
    // cannot both execute the same pending action.
    const claimed = await claimPendingModeration(pending.id);
    if (!claimed) {
        return null;
    }
    pending = claimed;

    const privateNote =
        opts?.privateNote !== undefined
            ? opts.privateNote
            : pending.privateNote && pending.privateNote !== 'None'
              ? pending.privateNote
              : null;
    const noteDisplay = privateNote || (opts?.timedOut ? 'None (auto — no response)' : 'None');
    const timedOut = Boolean(opts?.timedOut);
    const automation =
        pending.moderatorUserId === client.user?.id
            ? typeof pending.payload.automation === 'string'
                ? pending.payload.automation
                : 'Automated moderation'
            : null;

    const guild = client.guilds.cache.get(pending.guildId) || (await client.guilds.fetch(pending.guildId).catch(() => null));
    if (!guild) {
        console.error(`[ERROR] Pending mod ${pending.id}: guild ${pending.guildId} not available`);
        await markPendingFailed(pending.id);
        return null;
    }

    let member: GuildMember | null = await guild.members.fetch(pending.subjectUserId).catch(() => null);
    let subjectUser: User | null = member?.user || null;
    if (!subjectUser) {
        subjectUser = await client.users.fetch(pending.subjectUserId).catch(() => null);
    }
    if (!subjectUser) {
        console.error(`[ERROR] Pending mod ${pending.id}: subject user not found`);
        await markPendingCancelled(pending.id);
        return null;
    }

    const moderatorMember = await guild.members.fetch(pending.moderatorUserId).catch(() => null);
    const moderatorUser =
        moderatorMember?.user || (await client.users.fetch(pending.moderatorUserId).catch(() => null));

    const linked = linkedFromPending(pending);

    try {
        switch (pending.actionType) {
            case 'warn':
                return executeWarn(client, guild, pending, {
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
                return executeKick(client, guild, pending, {
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
                return executeBan(client, guild, pending, {
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
                return executeTimeout(client, guild, pending, {
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
                return null;
        }
    } catch (err) {
        console.error(`[ERROR] Failed to execute pending ${pending.id}:`, err);
        await markPendingFailed(pending.id);
        await editConfirm(
            client,
            pending,
            createEmbed({
                color: EmbedColors.FAILURE,
                title: 'Action failed',
                description:
                    `Discord rejected this action, so no punishment was applied and no case was recorded. ` +
                    `Please retry the command.`,
            }),
        );
    }
    return null;
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

const fieldValue = (value: string) => value.slice(0, 1024);

function discordTimestamp(date: Date): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function discordTimestampRelative(date: Date): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function rulesUrl(guild: Guild): string {
    return `https://discord.com/channels/${guild.id}/${channels.info}`;
}

async function storeActionDm(opts: {
    guildId: string;
    actionId: string;
    recordType: string;
    recordUuid: string;
    userId: string;
    dm: DmResult;
}): Promise<void> {
    if (!opts.dm.sent || !opts.dm.channelId || !opts.dm.messageId) return;
    await createModerationActionNotification({
        guildId: opts.guildId,
        actionId: opts.actionId,
        recordType: opts.recordType,
        recordUuid: opts.recordUuid,
        kind: 'action-dm',
        userId: opts.userId,
        channelId: opts.dm.channelId,
        messageId: opts.dm.messageId,
    }).catch(console.error);
}

function userActionDmEmbed(opts: {
    guild: Guild;
    color: number;
    actionPast: string;
    actionName: string;
    actionId: string;
    reason: string;
    expiresAt?: Date | null;
    infractionNumber: number;
}) {
    const fields: APIEmbedField[] = [
        { name: 'Reason', value: fieldValue(opts.reason), inline: false },
    ];

    if (opts.expiresAt) {
        fields.push({
            name: 'Expires',
            value: `This ${opts.actionName} will expire at ${discordTimestamp(opts.expiresAt)}`,
            inline: false,
        });
    }

    fields.push(
        {
            name: 'Notice',
            value: fieldValue(
                `This is your **__${formatOrdinal(opts.infractionNumber)}__** ${opts.actionName} infraction. ` +
                    `Further infractions${opts.expiresAt ? ` before this ${opts.actionName} expires` : ''} ` +
                    `may result in removal from our community. It is recommended that you read our ` +
                    `[server rules](${rulesUrl(opts.guild)}).`,
            ),
            inline: false,
        },
        {
            name: 'Appeal',
            value: `You may be able to appeal this action. You can do so on our [appeals form here](${appealUrl(opts.actionId)}).`,
            inline: false,
        },
    );

    return createEmbed(
        {
            color: opts.color,
            title: `You have been ${opts.actionPast} in ${opts.guild.name}`,
            description: `**Action ID**: \`${opts.actionId}\``,
            fields,
        },
        true,
    );
}

function timeoutUserDmEmbed(opts: {
    guild: Guild;
    actionId: string;
    reason: string;
    expiresAt: Date;
}) {
    return createEmbed(
        {
            color: EmbedColors.WARNING,
            title: `You have been timed out at ${opts.guild.name}`,
            description:
                `You will be able to join the discussion again in ${discordTimestampRelative(opts.expiresAt)}. ` +
                'In the meantime, maybe have a glass of water.',
            fields: [
                { name: 'Reason', value: fieldValue(opts.reason), inline: false },
                {
                    name: 'Appeal',
                    value: `You may be able to appeal this action. You can do so on our [appeals form here](${appealUrl(opts.actionId)}).`,
                    inline: false,
                },
            ],
            footer: { text: `This action (${opts.actionId}) has been logged into your account record.` },
        },
        true,
    );
}

async function executeWarn(
    client: Client,
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
        enrichProfile: false,
    });

    const warning = await createWarning({
        guildId: guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap.id,
        reason: pending.reason,
        privateNote: ctx.privateNote,
        expiresAt: pending.expiresAt,
        linked: ctx.linked,
    });

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
                expiresAt: pending.expiresAt,
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
            expiresAt: pending.expiresAt,
            durationToken: pending.durationToken,
            reason: pending.reason,
            privateNote: ctx.noteDisplay,
            actionId: publicId,
            automation: ctx.automation,
        }),
        footerUrl: modPortalUrl(publicId),
    });

    await markPendingCompleted(pending.id, warning.id);
    await editConfirm(
        client,
        pending,
        commandConfirmEmbed({
            actionPast: 'warned',
            subjectId: pending.subjectUserId,
            actionId: publicId,
            modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
            timedOut: ctx.timedOut,
            partial: !dm.sent,
        }),
    );
    return {
        actionId: publicId,
        modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
    };
}

async function executeKick(
    client: Client,
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
        enrichProfile: false,
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
        linked: ctx.linked,
        isAutomated: false,
        source: ctx.automation ? ctx.automation.toLowerCase() : 'bot',
    });
    const publicId = row.actionId || row.id;
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
        await deleteKickById(row.id).catch(console.error);
        throw err;
    }

    const counts = await getInfractionCounts(guild.id, pending.subjectUserId);
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
    await editConfirm(
        client,
        pending,
        commandConfirmEmbed({
            actionPast: 'kicked',
            subjectId: pending.subjectUserId,
            actionId: publicId,
            modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
            timedOut: ctx.timedOut,
            partial: !dm.sent,
        }),
    );
    return {
        actionId: publicId,
        modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
    };
}

async function executeBan(
    client: Client,
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
        enrichProfile: false,
    });

    const row = await createBan({
        guildId: guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap.id,
        reason: pending.reason,
        banType: ctx.soft ? 'soft' : 'hard',
        privateNotes: ctx.privateNote,
        expiresAt: pending.expiresAt,
        deleteMessageSeconds: pending.deleteMessageSeconds,
        linked: ctx.linked,
        source: ctx.automation ? ctx.automation.toLowerCase() : 'bot',
    });
    const publicId = row.actionId || row.id;
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
        await deleteBanById(row.id).catch(console.error);
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
    if (softUnbanned) {
        await liftBanById(row.id, 'soft-ban completed').catch(console.error);
    }

    const counts = await getInfractionCounts(guild.id, pending.subjectUserId);
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
    await editConfirm(
        client,
        pending,
        commandConfirmEmbed({
            actionPast: ctx.soft ? 'soft-banned' : 'banned',
            subjectId: pending.subjectUserId,
            actionId: publicId,
            modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
            timedOut: ctx.timedOut,
            partial: !dm.sent,
        }),
    );
    return {
        actionId: publicId,
        modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
    };
}

async function executeTimeout(
    client: Client,
    guild: Guild,
    pending: PendingModerationAction,
    ctx: Omit<ExecCtx, 'linked'>,
): Promise<ModerationExecutionResult> {
    const durationMs = pending.durationMs || 0;
    const expiresAt = pending.expiresAt || (durationMs ? new Date(Date.now() + durationMs) : null);

    const subjectSnap = await captureIdentitySnapshot({
        member: ctx.member || undefined,
        user: ctx.subjectUser,
    });
    const moderatorSnap = await captureIdentitySnapshot({
        member: ctx.moderatorMember || undefined,
        user: ctx.moderatorUser || undefined,
        discordUserId: pending.moderatorUserId,
        enrichProfile: false,
    });

    const discordTimeoutMs = Math.min(durationMs, MAX_DISCORD_TIMEOUT_MS);
    const timeoutClamped = durationMs > MAX_DISCORD_TIMEOUT_MS;
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
        durationToken: pending.durationToken,
        expiresAt,
        source: ctx.automation ? ctx.automation.toLowerCase() : 'bot',
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
            await deleteTimeoutById(row.id).catch(console.error);
            throw err;
        }
    }

    const counts = await getInfractionCounts(guild.id, pending.subjectUserId);

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
            durationToken: pending.durationToken,
            reason: pending.reason,
            privateNote: ctx.noteDisplay,
            actionId: publicId,
            automation: ctx.automation,
        }),
        footerUrl: modPortalUrl(publicId),
    });

    await markPendingCompleted(pending.id, row.id);
    await editConfirm(
        client,
        pending,
        commandConfirmEmbed({
            actionPast: 'muted',
            subjectId: pending.subjectUserId,
            actionId: publicId,
            modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
            timedOut: ctx.timedOut,
            partial: !dm.sent,
        }),
    );
    return {
        actionId: publicId,
        modLogUrl: modLog ? modLogMessageUrl(guild.id, modLog.channelId, modLog.messageId) : null,
        notice: timeoutClamped
            ? `:warning: Could not time out for the requested duration, exceeds Discord limits. Timed out for ${formatDurationMs(MAX_DISCORD_TIMEOUT_MS)}.`
            : undefined,
    };
}

function formatDurationMs(ms: number): string {
    if (ms % 86400000 === 0) return `${ms / 86400000} days`;
    if (ms % 3600000 === 0) return `${ms / 3600000} hours`;
    return `${Math.round(ms / 60000)} minutes`;
}

function buildModLogFields(opts: {
    action: 'warning' | 'kick' | 'ban' | 'timeout';
    subjectMember: GuildMember | null;
    subjectUser: User;
    subjectSnap: Awaited<ReturnType<typeof captureIdentitySnapshot>>;
    moderatorMember: GuildMember | null;
    moderatorUser: User | null;
    moderatorSnap: Awaited<ReturnType<typeof captureIdentitySnapshot>>;
    counts: Awaited<ReturnType<typeof getInfractionCounts>>;
    thisNth: number;
    dm: DmResult;
    expiresAt?: Date | null;
    durationToken?: string | null;
    reason: string;
    privateNote?: string | null;
    /** Public Action ID */
    actionId: string;
    automation?: string | null;
}) {
    const fields = [
        {
            name: 'User Information',
            value: formatUserInformationBlock({
                member: opts.subjectMember,
                user: opts.subjectUser,
                snap: opts.subjectSnap,
            }),
            inline: false,
        },
        {
            name: 'Infraction Count',
            value: formatInfractionCountLine(opts.action, opts.counts, opts.thisNth),
            inline: false,
        },
        {
            name: 'Notified',
            value: notifiedLine(opts.dm.sent, opts.dm.reason),
            inline: true,
        },
        {
            name: 'Expiration',
            value: opts.expiresAt ? opts.expiresAt.toUTCString() : 'Never',
            inline: true,
        },
        {
            name: 'Moderator',
            value: opts.automation
                ? `Bot Automation (${opts.automation})`
                : formatModeratorBlock({
                      member: opts.moderatorMember,
                      user: opts.moderatorUser,
                      snap: opts.moderatorSnap,
                  }),
            inline: false,
        },
    ];

    if (opts.action === 'timeout' || opts.action === 'ban') {
        fields.push({
            name: 'Duration',
            value: opts.durationToken || (opts.expiresAt ? 'Temporary' : 'Permanent'),
            inline: true,
        });
    }

    fields.push(
        {
            name: 'Reason',
            value: opts.reason || 'None',
            inline: false,
        },
        {
            name: 'Private Note',
            value: opts.privateNote || 'None',
            inline: false,
        },
    );

    return fields;
}

/** Resume stale pending actions after restart (no private note). */
export async function resumeStalePendingModeration(client: Client): Promise<void> {
    const { listStalePendingModerationActions } = await import('../db/repositories/pendingModeration');
    const stale = await listStalePendingModerationActions(3_000);
    if (stale.length === 0) return;
    console.log(`[mod] Resuming ${stale.length} pending moderation action(s) without private notes`);
    for (const p of stale) {
        await executePendingModeration(client, p, { privateNote: null, timedOut: true });
    }
}
