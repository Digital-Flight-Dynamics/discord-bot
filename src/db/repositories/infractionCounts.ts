import { getPool } from '../client';

export type InfractionCounts = {
    warningsTotal: number;
    warningsActive: number;
    mutes: number;
    kicks: number;
    bans: number;
    warningsRevoked: number;
    mutesRevoked: number;
    kicksRevoked: number;
    bansRevoked: number;
};

/** Count a user's cases in SQL without loading their full moderation history. */
export async function countInfractions(guildId: string, discordUserId: string): Promise<InfractionCounts> {
    const result = await getPool().query<Record<keyof InfractionCounts, string>>(
        `SELECT
            count(*) FILTER (WHERE kind = 'warning' AND resolution_status IS NULL) AS "warningsTotal",
            count(*) FILTER (
                WHERE kind = 'warning'
                  AND resolution_status IS NULL
                  AND removed_at IS NULL
                  AND (expires_at IS NULL OR expires_at > now())
            ) AS "warningsActive",
            count(*) FILTER (WHERE kind = 'timeout' AND resolution_status IS NULL) AS mutes,
            count(*) FILTER (WHERE kind = 'kick' AND resolution_status IS NULL) AS kicks,
            count(*) FILTER (WHERE kind = 'ban' AND resolution_status IS NULL) AS bans,
            count(*) FILTER (WHERE kind = 'warning' AND resolution_status IS NOT NULL) AS "warningsRevoked",
            count(*) FILTER (WHERE kind = 'timeout' AND resolution_status IS NOT NULL) AS "mutesRevoked",
            count(*) FILTER (WHERE kind = 'kick' AND resolution_status IS NOT NULL) AS "kicksRevoked",
            count(*) FILTER (WHERE kind = 'ban' AND resolution_status IS NOT NULL) AS "bansRevoked"
         FROM (
            SELECT 'warning' AS kind, w.resolution_status, w.removed_at, w.expires_at
              FROM warnings w JOIN identity_snapshots s ON s.id = w.subject_snapshot_id
             WHERE w.guild_id = $1 AND s.discord_user_id = $2
            UNION ALL
            SELECT 'timeout', t.resolution_status, NULL, NULL
              FROM timeouts t JOIN identity_snapshots s ON s.id = t.subject_snapshot_id
             WHERE t.guild_id = $1 AND s.discord_user_id = $2
            UNION ALL
            SELECT 'kick', k.resolution_status, NULL, NULL
              FROM kicks k JOIN identity_snapshots s ON s.id = k.subject_snapshot_id
             WHERE k.guild_id = $1 AND s.discord_user_id = $2
            UNION ALL
            SELECT 'ban', b.resolution_status, NULL, NULL
              FROM bans b JOIN identity_snapshots s ON s.id = b.subject_snapshot_id
             WHERE b.guild_id = $1 AND s.discord_user_id = $2
         ) cases`,
        [guildId, discordUserId],
    );
    const row = result.rows[0];
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as InfractionCounts;
}
