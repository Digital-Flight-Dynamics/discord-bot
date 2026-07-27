import { Message } from 'discord.js';
import * as chrono from 'chrono-node';

/** Strip mention wrappers from a user id argument. */
export function parseUserId(raw: string | undefined): string | null {
    if (!raw) return null;
    let id = raw;
    if (id.startsWith('<@') && id.endsWith('>')) {
        id = id.slice(2, -1);
        if (id.startsWith('!')) id = id.slice(1);
    }
    if (!/^\d{5,22}$/.test(id)) return null;
    return id;
}

/**
 * Parse flexible durations / future dates into milliseconds from now.
 * Supports compact and spaced units (`7d`, `7 d`, `7 da`, `7 day(s)`) plus
 * natural dates chrono understands (`tomorrow`, `next Friday`, `2026-08-01`).
 */
export function parseDurationToMs(arg: string | undefined): number {
    if (!arg) return 0;
    const input = arg.trim().replace(/\s+/g, ' ');
    if (!input) return 0;

    const unitMatch = /^(?:in\s+)?(\d+)\s*([a-z]+)$/i.exec(input);
    if (unitMatch) {
        const amount = parseInt(unitMatch[1], 10);
        const unit = unitMatch[2].toLowerCase();
        if (isNaN(amount) || amount <= 0) return 0;

        const seconds = unit.startsWith('sec') || unit === 's';
        const minutes = unit.startsWith('min') || unit === 'm';
        const hours = unit.startsWith('hr') || unit.startsWith('hour') || unit === 'h';
        const days = unit.startsWith('day') || unit === 'd' || unit === 'da';
        const weeks = unit.startsWith('week') || unit === 'w' || unit === 'wk' || unit === 'wks';
        const months = unit.startsWith('month') || unit === 'mo' || unit === 'mos';
        const years = unit.startsWith('year') || unit === 'y' || unit === 'yr' || unit === 'yrs';

        if (seconds) return amount * 1000;
        if (minutes) return amount * 60 * 1000;
        if (hours) return amount * 60 * 60 * 1000;
        if (days) return amount * 24 * 60 * 60 * 1000;
        if (weeks) return amount * 7 * 24 * 60 * 60 * 1000;
        if (months) return amount * 30 * 24 * 60 * 60 * 1000;
        if (years) return amount * 365 * 24 * 60 * 60 * 1000;
    }

    const now = new Date();
    const result = chrono.parse(input, now, { forwardDate: true })[0];
    if (!result || result.text.trim().toLowerCase() !== input.toLowerCase()) return 0;
    const diff = result.date().getTime() - now.getTime();
    return diff > 0 ? diff : 0;
}

export function splitLeadingDuration(args: string[]): {
    durationMs: number;
    durationToken: string | null;
    rest: string[];
} {
    for (let count = Math.min(4, args.length); count >= 1; count -= 1) {
        const token = args.slice(0, count).join(' ');
        const durationMs = parseDurationToMs(token);
        if (durationMs > 0) return { durationMs, durationToken: token, rest: args.slice(count) };
    }
    return { durationMs: 0, durationToken: null, rest: args };
}

/** Same units as duration, but returns seconds (for ban/soft-ban message purge duration). */
export function parseDurationToSeconds(arg: string | undefined): number {
    return Math.floor(parseDurationToMs(arg) / 1000);
}

/**
 * Split args after user id into optional duration + reason.
 * If first token is a duration, rest is reason; else entire rest is reason.
 */
export function splitDurationAndReason(args: string[]): { durationMs: number; reason: string; durationToken: string | null } {
    if (args.length === 0) {
        return { durationMs: 0, reason: 'None', durationToken: null };
    }
    const parsed = splitLeadingDuration(args);
    if (parsed.durationMs > 0) {
        return {
            durationMs: parsed.durationMs,
            reason: parsed.rest.join(' ') || 'None',
            durationToken: parsed.durationToken,
        };
    }
    return { durationMs: 0, reason: args.join(' ') || 'None', durationToken: null };
}

export type LinkedMessage = {
    linkedMessageId: string;
    linkedChannelId: string;
    linkedMessageUrl: string;
    linkedMessageDeleted: boolean;
};

/** Prefer reply reference; falls back to the command message itself only if requested. */
export function getLinkedMessageFromCommand(message: Message, opts?: { includeCommandMessage?: boolean }): LinkedMessage | null {
    const ref = message.reference;
    if (ref?.messageId && (ref.channelId || message.channelId) && message.guildId) {
        const channelId = ref.channelId || message.channelId;
        return {
            linkedMessageId: ref.messageId,
            linkedChannelId: channelId,
            linkedMessageUrl: `https://discord.com/channels/${message.guildId}/${channelId}/${ref.messageId}`,
            linkedMessageDeleted: false,
        };
    }
    if (opts?.includeCommandMessage && message.guildId) {
        return {
            linkedMessageId: message.id,
            linkedChannelId: message.channelId,
            linkedMessageUrl: `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`,
            linkedMessageDeleted: false,
        };
    }
    return null;
}

export function isActiveWarning(row: { removedAt: Date | null; expiresAt: Date | null }, now = new Date()): boolean {
    if (row.removedAt) return false;
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return false;
    return true;
}

export function warningStatusLabel(row: { removedAt: Date | null; expiresAt: Date | null }, now = new Date()): string {
    if (row.removedAt) return 'REMOVED';
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
    return 'ACTIVE';
}
