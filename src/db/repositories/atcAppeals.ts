import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../client';
import { atcAppeals, type AtcAppeal } from '../schema';

const openStatuses = ['submitted', 'review'];

export async function startAppealReview(input: {
    guildId: string;
    actionId: string;
    appealId: string;
    moderatorUserId: string;
}): Promise<AtcAppeal | null> {
    const [appeal] = await getDb()
        .update(atcAppeals)
        .set({
            status: 'review',
            reviewStartedAt: new Date(),
            reviewedByDiscordUserId: input.moderatorUserId,
        })
        .where(and(
            eq(atcAppeals.id, input.appealId),
            eq(atcAppeals.guildId, input.guildId),
            sql`upper(${atcAppeals.actionId}) = upper(${input.actionId})`,
            eq(atcAppeals.status, 'submitted'),
        ))
        .returning();
    return appeal ?? null;
}

export async function denyAppeal(input: {
    guildId: string;
    actionId: string;
    appealId: string;
    moderatorUserId: string;
    decisionNote: string | null;
}): Promise<AtcAppeal | null> {
    const [appeal] = await getDb()
        .update(atcAppeals)
        .set({
            status: 'denied',
            decidedAt: new Date(),
            decidedByDiscordUserId: input.moderatorUserId,
            decisionNote: input.decisionNote,
        })
        .where(and(
            eq(atcAppeals.id, input.appealId),
            eq(atcAppeals.guildId, input.guildId),
            sql`upper(${atcAppeals.actionId}) = upper(${input.actionId})`,
            inArray(atcAppeals.status, openStatuses),
        ))
        .returning();
    return appeal ?? null;
}
