import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { actionIds } from '../db/schema';

/**
 * Public moderation Action IDs (human-facing).
 *
 * Format:
 *   A + DD + MM + . + YY + K + NN + - + L
 *
 *   A   fixed "Action" prefix
 *   DD  UTC day (zero-padded)
 *   MM  UTC month (zero-padded)
 *   .   separator
 *   YY  UTC year (2 digits, e.g. 26)
 *   K   kind letter: T timeout, W warning, K kick, B ban, S softban
 *   NN  random two-digit number 00–99
 *   -   separator before trailing letter
 *   L   random letter X, Y, or Z
 *
 * Examples:
 *   A0701.26W42-X  — warning on 2026-01-07
 *   A2607.26T03-Y  — timeout on 2026-07-26
 *   A1512.26S88-Z  — softban on 2026-12-15
 *
 * UUIDs remain internal primary keys; Action IDs are unique public references.
 * Collisions regenerate until the registry insert succeeds.
 */

const MAX_ATTEMPTS = 32;
const XYZ = 'XYZ';

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
    const nn = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const letter = XYZ[Math.floor(Math.random() * XYZ.length)];
    return `A${dd}${mm}.${yy}${kind}${nn}-${letter}`;
}

/** Regex for the Action ID shape. */
export const ACTION_ID_RE = /^A\d{2}\d{2}\.\d{2}[TWKBSX]\d{2}-[XYZ]$/i;

export async function actionIdExists(actionId: string): Promise<boolean> {
    const db = getDb();
    const rows = await db
        .select({ id: actionIds.actionId })
        .from(actionIds)
        .where(eq(actionIds.actionId, actionId))
        .limit(1);
    return rows.length > 0;
}

/**
 * Generate a unique Action ID and reserve it in the registry.
 * Retries on collision until clear (or throws after MAX_ATTEMPTS).
 */
export async function allocateActionId(input: {
    recordType: ActionRecordType;
    recordUuid: string;
    guildId: string;
}): Promise<string> {
    const db = getDb();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = buildActionIdCandidate(input.recordType);
        try {
            await db.insert(actionIds).values({
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
