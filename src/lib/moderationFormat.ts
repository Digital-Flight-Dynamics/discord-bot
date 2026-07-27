import type { GuildMember, User } from 'discord.js';
import type { IdentitySnapshot } from '../db/schema';
import { countActiveWarnings, listAllWarnings } from '../db/repositories/warnings';
import { listKicksForUser } from '../db/repositories/kicks';
import { listBansForUser } from '../db/repositories/bans';
import { countTimeoutsForUser } from '../db/repositories/timeouts';

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
    return `${atcUrl()}/go-to/${encodeURIComponent(actionId)}`;
}

export function appealUrl(actionId: string): string {
    return `${atcUrl()}/go-to/appeal?id=${encodeURIComponent(actionId)}`;
}

export function atcUrl(): string {
    return (process.env.ATC_URL || 'https://atc.example.com').replace(/\/+$/, '');
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
    snap?: Pick<IdentitySnapshot, 'username' | 'displayName' | 'discordUserId' | 'pronouns' | 'bio'> | null;
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
    const pronouns = snap?.pronouns ?? null;
    const bio = snap?.bio ?? null;
    const lines = [
        id !== 'Unknown' ? `<@${id}>` : null,
        `Server Name: ${serverName || 'Unknown'}`,
        `Username: ${username}`,
        `ID: \`${id}\``,
        pronouns ? `Current pronouns: ${spoiler(pronouns)}` : null,
        bio ? `Current bio: ${spoiler(bio)}` : null,
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

export type InfractionCounts = {
    warningsTotal: number;
    warningsActive: number;
    mutes: number;
    kicks: number;
    bans: number;
};

export async function getInfractionCounts(guildId: string, discordUserId: string): Promise<InfractionCounts> {
    const [warningsActive, allWarnings, kicks, bans, mutes] = await Promise.all([
        countActiveWarnings(guildId, discordUserId),
        listAllWarnings(guildId, discordUserId),
        listKicksForUser(guildId, discordUserId),
        listBansForUser(guildId, discordUserId),
        countTimeoutsForUser(guildId, discordUserId),
    ]);
    return {
        warningsTotal: allWarnings.length,
        warningsActive,
        mutes,
        kicks: kicks.length,
        bans: bans.length,
    };
}

export function formatInfractionCountLine(
    action: 'warning' | 'kick' | 'ban' | 'timeout',
    counts: InfractionCounts,
    /** 1-based index of *this* action after it is recorded */
    thisNth?: number,
): string {
    const n = thisNth ?? (action === 'warning' ? counts.warningsTotal : action === 'kick' ? counts.kicks : action === 'ban' ? counts.bans : counts.mutes);
    const actionWord =
        action === 'warning' ? 'warning' : action === 'kick' ? 'kick' : action === 'ban' ? 'ban' : 'mute';
    const otherCounts = [
        action !== 'warning' ? `**${counts.warningsTotal}** warning(s)` : null,
        action !== 'timeout' ? `**${counts.mutes}** mute(s)` : null,
        action !== 'kick' ? `**${counts.kicks}** kick(s)` : null,
        action !== 'ban' ? `**${counts.bans}** ban(s)` : null,
    ].filter((item): item is string => Boolean(item));
    return (
        `This is their **${formatOrdinal(n)}** ${actionWord}. ` +
        `They have ${joinWithAnd(otherCounts)} on their record.`
    );
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
