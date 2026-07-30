import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { actionIds, type NewActionIdRow } from '../db/schema';

/**
 * Public moderation Action IDs (human-facing).
 *
 * Format:
 *   A + DD + MM + . + YY + K + - + R
 *
 *   A   fixed "Action" prefix
 *   DD  UTC day (zero-padded)
 *   MM  UTC month (zero-padded)
 *   .   separator
 *   YY  UTC year (2 digits, e.g. 26)
 *   K   kind letter: T timeout, W warning, K kick, B ban, S softban
 *   -   separator
 *   R   64 bits of cryptographically secure random hex
 *
 * Examples:
 *   A0701.26W-9E6B9F5A81D2C407 — warning on 2026-01-07
 *
 * UUIDs remain internal primary keys; Action IDs are unique public references.
 * Collisions regenerate until the registry insert succeeds.
 */

const MAX_ATTEMPTS = 32;

export type ActionRecordType = 'warning' | 'kick' | 'ban' | 'softban' | 'timeout' | 'other';

/** First letter of the action kind (softban → S). */
export function actionKindLetter(recordType: ActionRecordType): string {
    switch (recordType) {
        case 'timeout':
            return 'T';
        case 'warning':
            return 'W';
        case 'kick':
            return 'K';
        case 'ban':
            return 'B';
        case 'softban':
            return 'S';
        default:
            return 'X'; // fallback — still valid trailing letter pool
    }
}

/** Build one candidate Action ID (not yet uniqueness-checked). */
export function buildActionIdCandidate(
    recordType: ActionRecordType = 'other',
    date: Date = new Date(),
): string {
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(date.getUTCFullYear()).slice(-2);
    const kind = actionKindLetter(recordType);
    const random = randomBytes(8).toString('hex').toUpperCase();
    return `A${dd}${mm}.${yy}${kind}-${random}`;
}

/** Regex for the Action ID shape. */
export const ACTION_ID_RE = /^A\d{4}\.\d{2}[TWKBSX]-(?:[A-F0-9]{16}|\d{2}-[XYZ])$/i;
const LEGACY_ACTION_ID_RE = /^A\d{4}\.\d{2}[TWKBSX]\d{2}-[XYZ]$/i;

/**
 * Accept Action IDs with either separator omitted, with no separators, and
 * optionally without the visual `A` prefix.
 */
export function normalizeActionId(raw: string): string {
    const cleaned = raw.trim().replace(/[`#]/g, '').toUpperCase();
    if (ACTION_ID_RE.test(cleaned) || LEGACY_ACTION_ID_RE.test(cleaned)) return cleaned;

    const compact = cleaned.replace(/[^A-Z0-9]/g, '');
    if (/^A\d{6}[TWKBSX][A-F0-9]{16}$/.test(compact)) {
        return `${compact.slice(0, 5)}.${compact.slice(5, 8)}-${compact.slice(8)}`;
    }
    if (/^\d{6}[TWKBSX][A-F0-9]{16}$/.test(compact)) {
        const prefixed = `A${compact}`;
        return `${prefixed.slice(0, 5)}.${prefixed.slice(5, 8)}-${prefixed.slice(8)}`;
    }
    if (/^\d{6}[TWKBSX]\d{2}[XYZ]$/.test(compact)) {
        const prefixed = `A${compact}`;
        return `${prefixed.slice(0, 5)}.${prefixed.slice(5, 10)}-${prefixed.slice(10)}`;
    }
    if (/^A\d{6}[TWKBSX]\d{2}[XYZ]$/.test(compact)) return `${compact.slice(0, 5)}.${compact.slice(5, 10)}-${compact.slice(10)}`;
    return cleaned;
}

export async function actionIdExists(actionId: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
        .select({ id: actionIds.actionId })
        .from(actionIds)
        .where(eq(actionIds.actionId, normalizeActionId(actionId)))
        .limit(1);
    return rows.length > 0;
}

/** Resolve a public Action ID to its underlying record, scoped to a guild. */
export async function resolveActionId(
    actionId: string,
    guildId: string,
): Promise<{ recordType: string; recordUuid: string } | null> {
    const db = getDb();
    const rows = await db
        .select({ recordType: actionIds.recordType, recordUuid: actionIds.recordUuid })
        .from(actionIds)
        .where(and(eq(actionIds.actionId, normalizeActionId(actionId)), eq(actionIds.guildId, guildId)))
        .limit(1);
    return rows[0] ?? null;
}

/**
 * Generate a unique Action ID and reserve it in the registry.
 * Retries on collision until clear (or throws after MAX_ATTEMPTS).
 */
export async function allocateActionId(
    input: { recordType: ActionRecordType; recordUuid: string; guildId: string },
    reserve: (row: NewActionIdRow) => Promise<unknown> = async (row) => {
        await getDb().insert(actionIds).values(row);
    },
): Promise<string> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = buildActionIdCandidate(input.recordType);
        try {
            await reserve({
                actionId: candidate,
                recordType: input.recordType,
                recordUuid: input.recordUuid,
                guildId: input.guildId,
            });
            return candidate;
        } catch (err: unknown) {
            const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
            if (code === '23505') continue;
            const msg = err instanceof Error ? err.message : String(err);
            if (/unique|duplicate/i.test(msg)) continue;
            throw err;
        }
    }

    throw new Error(`Failed to allocate unique Action ID after ${MAX_ATTEMPTS} attempts`);
}
