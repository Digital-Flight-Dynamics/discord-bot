/**
 * Soft-lock: bot stays online but only super-simple commands run.
 * Used when workspace constants are empty or DB/config bootstrap fails.
 */

import type { GuildMember } from 'discord.js';
import { roleGroups, roles } from '../config';

let locked = false;
let reasons: string[] = [];

/** Commands allowed while soft-locked (command primary names + aliases). */
export const SOFT_LOCK_ALLOWED_COMMANDS = new Set([
    'help',
    'ping',
    'whoosh',
    'devchannels',
    'devsetup',
]);

/** Soft-lock diagnostic replies auto-delete after this (prefix commands can't be true-ephemeral). */
export const SOFT_LOCK_REPLY_TTL_MS = 12_000;

export function isSoftLocked(): boolean {
    return locked;
}

export function getSoftLockReasons(): string[] {
    return [...reasons];
}

export function addSoftLockReason(reason: string, opts?: { silent?: boolean }): void {
    if (!reasons.includes(reason)) {
        reasons.push(reason);
    }
    locked = true;
    if (!opts?.silent) {
        console.error(`[ERROR] Soft-locked: ${reason}. Read DEVELOPMENT.md for details.`);
    }
}

export function clearSoftLock(): void {
    locked = false;
    reasons = [];
}

export function softLockSummary(): string {
    if (!locked) return 'ok';
    return reasons.join(' · ') || 'configuration incomplete';
}

/** Staff who may see soft-lock diagnostics (mods, devs, management, etc.). */
export function canSeeSoftLockDiagnostics(member: GuildMember | null | undefined): boolean {
    if (!member) return false;

    // Only role-based: if no staff role IDs are configured, show nothing to anyone
    const staffRoleIds = new Set(
        [
            ...roleGroups.moderation,
            ...roleGroups.team,
            ...roleGroups.dfd,
            ...roleGroups.projectTeam,
            roles.management,
            roles.moderator,
            roles.developer,
        ].filter((id) => id && !/^0+$/.test(id)),
    );

    if (staffRoleIds.size === 0) {
        return false;
    }

    return member.roles.cache.some((r) => staffRoleIds.has(r.id));
}
