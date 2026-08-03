import { and, eq } from 'drizzle-orm';
import { getDb } from '../client';
import { moderationPresets, type ModerationPreset, type NewModerationPreset } from '../schema';

export async function listAllModerationPresets(guildId: string): Promise<ModerationPreset[]> {
    const db = getDb();
    return db.select().from(moderationPresets).where(eq(moderationPresets.guildId, guildId));
}

export async function createModerationPreset(input: NewModerationPreset): Promise<ModerationPreset> {
    const db = getDb();
    const [row] = await db.insert(moderationPresets).values(input).returning();
    return row;
}

export async function deleteModerationPreset(guildId: string, id: string): Promise<ModerationPreset | null> {
    const db = getDb();
    const [row] = await db
        .delete(moderationPresets)
        .where(and(eq(moderationPresets.guildId, guildId), eq(moderationPresets.id, id)))
        .returning();
    return row ?? null;
}

export async function findModerationPresetById(guildId: string, id: string): Promise<ModerationPreset | null> {
    const db = getDb();
    const rows = await db
        .select()
        .from(moderationPresets)
        .where(and(eq(moderationPresets.guildId, guildId), eq(moderationPresets.id, id)))
        .limit(1);
    return rows[0] ?? null;
}

export async function updateModerationPreset(
    guildId: string,
    id: string,
    patch: Partial<NewModerationPreset>,
): Promise<ModerationPreset | null> {
    const db = getDb();
    const [row] = await db
        .update(moderationPresets)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(moderationPresets.guildId, guildId), eq(moderationPresets.id, id)))
        .returning();
    return row ?? null;
}
