import {
    AuditLogEvent,
    Client,
    Guild,
    GuildBan,
    GuildMember,
    PartialGuildMember,
    User,
} from 'discord.js';
import { createBan } from '../db/repositories/bans';
import { createKick } from '../db/repositories/kicks';
import { captureIdentitySnapshot } from '../db/repositories/snapshots';
import { createTimeout } from '../db/repositories/timeouts';
import { EmbedColors } from './embed';
import {
    formatInfractionCountLine,
    formatModeratorBlock,
    formatUserInformationBlock,
    getInfractionCounts,
    modPortalUrl,
    notifiedLine,
} from './moderationFormat';
import { logModerationAction } from './moderationNotify';

const AUDIT_LOG_DELAY_MS = 1500;
const AUDIT_LOG_WINDOW_MS = 15_000;
const DISCORD_SOURCE = 'discord';
const DISCORD_NOTE = 'Created automatically from a Discord-level moderation action, not a bot command.';

export function registerDiscordModerationTracker(client: Client): void {
    client.on('guildBanAdd', (ban) => {
        void trackDiscordBan(client, ban).catch((err) => console.error('[ERROR] Failed to track Discord ban:', err));
    });

    client.on('guildMemberRemove', (member) => {
        void trackDiscordKick(client, member).catch((err) => console.error('[ERROR] Failed to track Discord kick:', err));
    });

    client.on('guildMemberUpdate', (oldMember, newMember) => {
        void trackDiscordTimeout(client, oldMember, newMember).catch((err) =>
            console.error('[ERROR] Failed to track Discord timeout:', err),
        );
    });
}

async function trackDiscordBan(client: Client, ban: GuildBan): Promise<void> {
    await delay(AUDIT_LOG_DELAY_MS);
    const audit = await latestAuditForTarget(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    if (!audit || audit.executor?.id === client.user?.id) return;

    const moderatorUser = audit.executor || null;
    const moderatorMember = moderatorUser ? await ban.guild.members.fetch(moderatorUser.id).catch(() => null) : null;
    const subjectSnap = await captureIdentitySnapshot({
        user: ban.user,
        discordUserId: ban.user.id,
        username: ban.user.username,
    });
    const moderatorSnap = moderatorUser
        ? await captureIdentitySnapshot({
              member: moderatorMember || undefined,
              user: moderatorUser,
              discordUserId: moderatorUser.id,
              enrichProfile: false,
          })
        : null;
    const reason = audit.reason || ban.reason || 'No reason provided';
    const row = await createBan({
        guildId: ban.guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap?.id ?? null,
        reason,
        banType: 'hard',
        privateNotes: DISCORD_NOTE,
        source: DISCORD_SOURCE,
    });
    const counts = await getInfractionCounts(ban.guild.id, ban.user.id);
    await postDiscordCaseLog(client, ban.guild, {
        action: 'ban',
        actionPast: 'banned',
        caseId: row.id,
        actionId: row.actionId || row.id,
        subjectUser: ban.user,
        subjectMember: null,
        subjectSnap,
        moderatorUser,
        moderatorMember,
        moderatorSnap,
        counts,
        thisNth: counts.bans,
        reason,
    });
}

async function trackDiscordKick(client: Client, member: GuildMember | PartialGuildMember): Promise<void> {
    await delay(AUDIT_LOG_DELAY_MS);
    const audit = await latestAuditForTarget(member.guild, AuditLogEvent.MemberKick, member.id);
    if (!audit || audit.executor?.id === client.user?.id) return;

    const user = member.user || (await client.users.fetch(member.id).catch(() => null));
    if (!user) return;
    const moderatorUser = audit.executor || null;
    const moderatorMember = moderatorUser ? await member.guild.members.fetch(moderatorUser.id).catch(() => null) : null;
    const subjectSnap = await captureIdentitySnapshot({
        member: member.partial ? undefined : (member as GuildMember),
        user,
        discordUserId: user.id,
        username: user.username,
    });
    const moderatorSnap = moderatorUser
        ? await captureIdentitySnapshot({
              member: moderatorMember || undefined,
              user: moderatorUser,
              discordUserId: moderatorUser.id,
              enrichProfile: false,
          })
        : null;
    const reason = audit.reason || 'No reason provided';
    const row = await createKick({
        guildId: member.guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap?.id ?? null,
        reason,
        privateNote: DISCORD_NOTE,
        source: DISCORD_SOURCE,
    });
    const counts = await getInfractionCounts(member.guild.id, user.id);
    await postDiscordCaseLog(client, member.guild, {
        action: 'kick',
        actionPast: 'kicked',
        caseId: row.id,
        actionId: row.actionId || row.id,
        subjectUser: user,
        subjectMember: member.partial ? null : (member as GuildMember),
        subjectSnap,
        moderatorUser,
        moderatorMember,
        moderatorSnap,
        counts,
        thisNth: counts.kicks,
        reason,
    });
}

async function trackDiscordTimeout(
    client: Client,
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
): Promise<void> {
    const oldUntil = oldMember.communicationDisabledUntil?.getTime() || 0;
    const newUntil = newMember.communicationDisabledUntil?.getTime() || 0;
    if (newUntil <= Date.now() || newUntil === oldUntil) return;

    await delay(AUDIT_LOG_DELAY_MS);
    const audit = await latestAuditForTarget(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
    if (!audit || audit.executor?.id === client.user?.id) return;
    if (!auditLooksLikeTimeout(audit)) return;

    const moderatorUser = audit.executor || null;
    const moderatorMember = moderatorUser ? await newMember.guild.members.fetch(moderatorUser.id).catch(() => null) : null;
    const subjectSnap = await captureIdentitySnapshot({ member: newMember, user: newMember.user });
    const moderatorSnap = moderatorUser
        ? await captureIdentitySnapshot({
              member: moderatorMember || undefined,
              user: moderatorUser,
              discordUserId: moderatorUser.id,
              enrichProfile: false,
          })
        : null;
    const reason = audit.reason || 'No reason provided';
    const durationMs = Math.max(0, newUntil - Date.now());
    const durationToken = formatDurationMs(durationMs);
    const expiresAt = new Date(newUntil);
    const row = await createTimeout({
        guildId: newMember.guild.id,
        subjectSnapshotId: subjectSnap.id,
        moderatorSnapshotId: moderatorSnap?.id ?? null,
        reason,
        privateNote: DISCORD_NOTE,
        durationMs,
        durationToken,
        expiresAt,
        source: DISCORD_SOURCE,
    });
    const counts = await getInfractionCounts(newMember.guild.id, newMember.id);
    await postDiscordCaseLog(client, newMember.guild, {
        action: 'timeout',
        actionPast: 'muted',
        caseId: row.id,
        actionId: row.actionId || row.id,
        subjectUser: newMember.user,
        subjectMember: newMember,
        subjectSnap,
        moderatorUser,
        moderatorMember,
        moderatorSnap,
        counts,
        thisNth: counts.mutes,
        expiresAt,
        durationToken,
        reason,
    });
}

async function postDiscordCaseLog(
    client: Client,
    guild: Guild,
    opts: {
        action: 'kick' | 'ban' | 'timeout';
        actionPast: string;
        caseId: string;
        actionId: string;
        subjectUser: User;
        subjectMember: GuildMember | null;
        subjectSnap: Awaited<ReturnType<typeof captureIdentitySnapshot>>;
        moderatorUser: User | null;
        moderatorMember: GuildMember | null;
        moderatorSnap: Awaited<ReturnType<typeof captureIdentitySnapshot>> | null;
        counts: Awaited<ReturnType<typeof getInfractionCounts>>;
        thisNth: number;
        expiresAt?: Date | null;
        durationToken?: string | null;
        reason: string;
    },
): Promise<void> {
    const modLog = await logModerationAction(guild, {
        color: opts.action === 'ban' ? EmbedColors.FAILURE : EmbedColors.WARNING,
        caseType: opts.action,
        caseId: opts.caseId,
        actionId: opts.actionId,
        subjectUserId: opts.subjectUser.id,
        subjectTag: opts.subjectUser.tag,
        moderatorId: opts.moderatorUser?.id,
        description: `<@${opts.subjectUser.id}> has been **${opts.actionPast}**. Action ID \`#${opts.actionId}\``,
        fields: [
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
            { name: 'Notified', value: notifiedLine(false, 'Discord-level action; no bot DM sent'), inline: true },
            {
                name: 'Expiration',
                value: opts.expiresAt ? opts.expiresAt.toUTCString() : 'Never',
                inline: true,
            },
            {
                name: 'Moderator',
                value: opts.moderatorSnap
                    ? formatModeratorBlock({
                          member: opts.moderatorMember,
                          user: opts.moderatorUser,
                          snap: opts.moderatorSnap,
                      })
                    : 'Unknown',
                inline: false,
            },
            { name: 'Source', value: 'Discord-level moderation action (not a bot command)', inline: false },
            ...(opts.action === 'timeout' || opts.action === 'ban'
                ? [{ name: 'Duration', value: opts.durationToken || (opts.expiresAt ? 'Temporary' : 'Permanent'), inline: true }]
                : []),
            { name: 'Reason', value: opts.reason || 'No reason provided', inline: false },
            { name: 'Private Note', value: DISCORD_NOTE, inline: false },
        ],
        footerUrl: modPortalUrl(opts.actionId),
    });
    void client;
    void modLog;
}

async function latestAuditForTarget(guild: Guild, event: AuditLogEvent, targetId: string) {
    const logs = await guild.fetchAuditLogs({ type: event, limit: 5 }).catch(() => null);
    const now = Date.now();
    return logs?.entries.find((entry) => {
        const target = entry.target as { id?: string } | null;
        return target?.id === targetId && now - entry.createdTimestamp < AUDIT_LOG_WINDOW_MS;
    }) || null;
}

function auditLooksLikeTimeout(audit: Awaited<ReturnType<typeof latestAuditForTarget>>): boolean {
    return Boolean(
        audit?.changes?.some((change) =>
            ['communication_disabled_until', 'communicationDisabledUntil'].includes(String(change.key)),
        ),
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDurationMs(ms: number): string {
    const units = [
        { label: 'day', ms: 86_400_000 },
        { label: 'hour', ms: 3_600_000 },
        { label: 'minute', ms: 60_000 },
    ];
    for (const unit of units) {
        const value = Math.round(ms / unit.ms);
        if (value >= 1) return `${value} ${unit.label}${value === 1 ? '' : 's'}`;
    }
    return 'Less than 1 minute';
}
