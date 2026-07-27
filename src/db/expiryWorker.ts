import { Client } from 'discord.js';
import { listExpiredOpenBans, liftBanById } from './repositories/bans';
import { guildId as configGuildId } from '../config';

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
                    client.guilds.cache.get(ban.guildId) ||
                    (process.env.GUILD_ID ? client.guilds.cache.get(process.env.GUILD_ID) : undefined) ||
                    (configGuildId ? client.guilds.cache.get(configGuildId) : undefined) ||
                    client.guilds.cache.first();
                if (!guild) {
                    console.error(`Expiry worker: guild ${ban.guildId} not in cache`);
                    continue;
                }

                try {
                    await guild.members.unban(userId, 'Temporary ban expired');
                } catch (err) {
                    // Already unbanned or unknown — still lift the row
                    console.error(`Expiry worker: Discord unban failed for ${userId}:`, err);
                }

                await liftBanById(ban.id, 'expired');
                console.log(`Expiry worker: lifted ban ${ban.id} for user ${userId}`);
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
