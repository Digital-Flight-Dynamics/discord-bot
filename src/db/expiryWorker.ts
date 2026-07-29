import { Client, DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { listExpiredOpenBans, liftBanById } from './repositories/bans';

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Periodically unbans users whose ban rows have expired.
 * Warning expiry is query-time only (active filters on expires_at).
 */
export function startExpiryWorker(client: Client, intervalMs = DEFAULT_INTERVAL_MS): NodeJS.Timeout {
    const tick = async () => {
        try {
            const expired = await listExpiredOpenBans();
            for (const ban of expired) {
                const userId = ban.subject?.discordUserId;
                if (!userId) continue;

                const guild =
                    client.guilds.cache.get(ban.guildId) || (await client.guilds.fetch(ban.guildId).catch(() => null));
                if (!guild) {
                    console.error(`Expiry worker: guild ${ban.guildId} not available, skipping (will retry)`);
                    continue;
                }

                let shouldLift = false;
                try {
                    await guild.members.unban(userId, 'Temporary ban expired');
                    shouldLift = true;
                } catch (err) {
                    if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownBan) {
                        // Already unbanned — safe to lift the row.
                        shouldLift = true;
                    } else {
                        console.error(`Expiry worker: Discord unban failed for ${userId}, will retry:`, err);
                    }
                }

                if (shouldLift) {
                    await liftBanById(ban.id, 'expired');
                }
            }
        } catch (err) {
            console.error('Expiry worker tick failed:', err);
        }
    };

    // slight delay so guild cache is warm
    setTimeout(() => {
        tick().catch(console.error);
    }, 5_000);

    return setInterval(() => {
        tick().catch(console.error);
    }, intervalMs);
}
