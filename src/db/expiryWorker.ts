import { Client, DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { hasOtherActiveBan, listExpiredOpenBans, liftBanById } from './repositories/bans';
import { discordAuditReason } from '../lib/moderationFormat';
import { postModerationThreadNote } from '../lib/moderationNotify';

const DEFAULT_INTERVAL_MS = 60_000;
const NOT_UNBANNED_NOTE = 'User was not unbanned as they have another active ban on their account.';

/** Starts a single-flight expiry worker and returns a cleanup function. */
export function startExpiryWorker(client: Client, intervalMs = DEFAULT_INTERVAL_MS): () => void {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const expired = await listExpiredOpenBans();
            for (const ban of expired) {
                const userId = ban.subject?.discordUserId;
                if (!userId) continue;

                if (await hasOtherActiveBan({ guildId: ban.guildId, discordUserId: userId, excludingBanId: ban.id })) {
                    await liftBanById(ban.id, 'expired; another active ban remains');
                    await postModerationThreadNote({
                        client,
                        caseType: 'ban',
                        caseId: ban.id,
                        title: 'Ban expired',
                        description: NOT_UNBANNED_NOTE,
                    });
                    continue;
                }

                const guild =
                    client.guilds.cache.get(ban.guildId) || (await client.guilds.fetch(ban.guildId).catch(() => null));
                if (!guild) {
                    console.error(`Expiry worker: guild ${ban.guildId} not available, skipping (will retry)`);
                    continue;
                }

                let shouldLift = false;
                try {
                    await guild.members.unban(
                        userId,
                        discordAuditReason(
                            ban.actionId || ban.id,
                            client.user?.username || 'Unknown',
                            client.user?.id || 'Unknown',
                            'Temporary ban expired',
                        ),
                    );
                    shouldLift = true;
                } catch (err) {
                    if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownBan) shouldLift = true;
                    else console.error(`Expiry worker: Discord unban failed for ${userId}, will retry:`, err);
                }
                if (shouldLift) await liftBanById(ban.id, 'expired');
            }
        } catch (err) {
            console.error('Expiry worker tick failed:', err);
        } finally {
            running = false;
        }
    };

    const initial = setTimeout(() => void tick(), 5_000);
    const interval = setInterval(() => void tick(), intervalMs);
    return () => {
        clearTimeout(initial);
        clearInterval(interval);
    };
}
