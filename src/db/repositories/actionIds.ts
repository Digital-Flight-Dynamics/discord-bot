import { eq } from 'drizzle-orm';
import { getDb } from '../client';
import { actionIds, type ActionIdRow } from '../schema';

export async function findActionId(actionId: string): Promise<ActionIdRow | null> {
    const db = getDb();
    const rows = await db.select().from(actionIds).where(eq(actionIds.actionId, actionId)).limit(1);
    return rows[0] ?? null;
}
