import type { GuildMember, User } from 'discord.js';
import type { IdentitySnapshot } from '../db/schema';
import { countInfractions, type InfractionCounts } from '../db/repositories/infractionCounts';

export function formatOrdinal(n: number): string {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    switch (n % 10) {
        case 1:
            return `${n}st`;
        case 2:
            return `${n}nd`;
        case 3:
            return `${n}rd`;
        default:
            return `${n}th`;
    }
}

export function modPortalUrl(actionId: string): string {
    return `${atcUrl()}/action/${encodeURIComponent(actionId)}`;
}

export function moderationActionUrl(actionId: string): string {
    return `${atcUrl()}/moderation/actions/${encodeURIComponent(actionId)}`;
}

export function appealUrl(actionId: string): string {
    return modPortalUrl(actionId);
}

export function appealProgressUrl(actionId: string, appealId: string): string {
    return `${modPortalUrl(actionId)}/appeal/${encodeURIComponent(appealId)}`;
}

export function atcUrl(): string {
    return (process.env.ATC_URL || 'http://localhost:4321').replace(/\/+$/, '');
}

export function spoiler(text: string | null | undefined, empty = 'None'): string {
    const t = (text || '').trim();
    if (!t) return empty;
    // Discord spoiler; escape nested ||
    return `||${t.replace(/\|/g, '\\|')}||`;
}

export function formatUserInformationBlock(opts: {
    member?: GuildMember | null;
    user?: User | null;
    snap?: Pick<IdentitySnapshot, 'username' | 'displayName' | 'discordUserId'> | null;
}): string {
    const user = opts.user || opts.member?.user || null;
    const member = opts.member || null;
    const snap = opts.snap;

    const username = user?.username || snap?.username || 'Unknown';
    const id = user?.id || snap?.discordUserId || member?.id || 'Unknown';
    const globalName = user ? ((user as User & { globalName?: string | null }).globalName ?? null) : null;
    const memberDisplay = member?.displayName || null;
    const snapDisplay = snap?.displayName || null;
    const serverName =
        firstUsefulDisplayName([memberDisplay, globalName, snapDisplay], username) ||
        memberDisplay ||
        globalName ||
        snapDisplay ||
        username;
    const lines = [
        id !== 'Unknown' ? `<@${id}>` : null,
        `Server Name: ${serverName || 'Unknown'}`,
        `Username: ${username}`,
        `ID: \`${id}\``,
    ];
    return lines.filter(Boolean).join('\n');
}

export function formatModeratorBlock(opts: {
    member?: GuildMember | null;
    user?: User | null;
    snap?: Pick<IdentitySnapshot, 'username' | 'displayName' | 'discordUserId'> | null;
}): string {
    const user = opts.user || opts.member?.user || null;
    const member = opts.member || null;
    const snap = opts.snap;
    const username = user?.username || snap?.username || 'Unknown';
    const id = user?.id || snap?.discordUserId || 'Unknown';
    const globalName = user ? ((user as User & { globalName?: string | null }).globalName ?? null) : null;
    const memberDisplay = member?.displayName || null;
    const snapDisplay = snap?.displayName || null;
    const serverName =
        firstUsefulDisplayName([memberDisplay, globalName, snapDisplay], username) ||
        memberDisplay ||
        globalName ||
        snapDisplay ||
        username;
    return [
        id !== 'Unknown' ? `<@${id}>` : user?.tag || snap?.username || 'Unknown',
        `Server Name: ${serverName || 'Unknown'}`,
        `Username: ${username}`,
        `ID: \`${id}\``,
    ].join('\n');
}

function firstUsefulDisplayName(names: Array<string | null | undefined>, username: string): string | null {
    return names.find((name) => name && name !== username) || null;
}

export type { InfractionCounts };

export async function getInfractionCounts(guildId: string, discordUserId: string): Promise<InfractionCounts> {
    return countInfractions(guildId, discordUserId);
}

export function formatInfractionCountLine(
    action: 'warning' | 'kick' | 'ban' | 'timeout',
    counts: InfractionCounts,
    /** 1-based index of *this* action after it is recorded */
    thisNth?: number,
): string {
    const totals = {
        warning: counts.warningsTotal,
        kick: counts.kicks,
        ban: counts.bans,
        timeout: counts.mutes,
    };
    const actionWords = { warning: 'warning', kick: 'kick', ban: 'ban', timeout: 'mute' };
    const n = thisNth ?? totals[action];
    const actionWord = actionWords[action];
    const otherCounts = [
        action !== 'warning' ? formatRecordCount(counts.warningsTotal, counts.warningsRevoked, 'warning') : null,
        action !== 'timeout' ? formatRecordCount(counts.mutes, counts.mutesRevoked, 'mute') : null,
        action !== 'kick' ? formatRecordCount(counts.kicks, counts.kicksRevoked, 'kick') : null,
        action !== 'ban' ? formatRecordCount(counts.bans, counts.bansRevoked, 'ban') : null,
    ].filter((item): item is string => Boolean(item));
    return (
        `This is their **${formatOrdinal(n)}** ${actionWord}. ` +
        `They have ${joinWithAnd(otherCounts)} on their record.`
    );
}

function formatRecordCount(active: number, revoked: number, noun: string): string {
    return `**${active}**${revoked > 0 ? ` [${revoked}R]` : ''} ${noun}(s)`;
}

function joinWithAnd(items: string[]): string {
    if (items.length <= 1) return items.join('');
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function notifiedLine(dmSent: boolean, reason?: string): string {
    if (dmSent) return '📬 They have been DMed';
    return `📭 They have **not** been DMed${reason ? ` (${reason})` : ''}`;
}

export function modLogMessageUrl(guildId: string, channelId: string, messageId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/** Discord audit-log reasons are limited to 512 characters. */
export function discordAuditReason(
    actionId: string,
    moderatorUsername: string,
    moderatorId: string,
    reason: string,
): string {
    const prefix = `Action ID: ${actionId} | Moderator: ${moderatorUsername} - ${moderatorId} | Reason: `;
    return `${prefix}${reason}`.slice(0, 512);
}
