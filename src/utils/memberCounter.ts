import { Client } from 'discord.js';
import { UtilDefinition } from '.';
import { channels, guildId as configGuildId } from '../config';
import { isUnsetSnowflake } from '../config/channelNames';
import { logMissingRequiredChannel } from '../config/errors';
import { isSoftLocked } from '../runtime/softLock';

function resolveGuild(client: Client) {
    if (configGuildId && !isUnsetSnowflake(configGuildId)) {
        const byConfig = client.guilds.cache.get(configGuildId);
        if (byConfig) return byConfig;
    }
    if (process.env.GUILD_ID) {
        const byEnv = client.guilds.cache.get(process.env.GUILD_ID);
        if (byEnv) return byEnv;
    }
    return client.guilds.cache.first();
}

async function resolveMemberCountChannel(client: Client) {
    const guild = resolveGuild(client);
    if (!guild) return { guild: null, channel: null };

    const configuredId = channels.memberCounter;
    if (!isUnsetSnowflake(configuredId)) {
        const cached = guild.channels.cache.get(configuredId);
        if (cached) return { guild, channel: cached };

        const fetched = await guild.channels.fetch(configuredId).catch(() => null);
        if (fetched) return { guild, channel: fetched };
    }

    const byName = guild.channels.cache.find((c) => {
        const n = c.name.toLowerCase();
        return n === 'member-count' || n.includes('member count');
    });
    if (byName) return { guild, channel: byName };

    return { guild, channel: null };
}

export const memberCounter: UtilDefinition = {
    event: 'ready',
    execute: (client: Client) => {
        let missingLogged = false;

        setInterval(async () => {
            try {
                // Soft-lock / empty constants: boot already logs missing channels — stay quiet
                if (isSoftLocked() || isUnsetSnowflake(channels.memberCounter)) {
                    return;
                }

                const { guild, channel } = await resolveMemberCountChannel(client);

                if (!guild || !channel) {
                    if (!missingLogged) {
                        logMissingRequiredChannel('channels.memberCounter');
                        missingLogged = true;
                    }
                    return;
                }

                missingLogged = false;
                const label = `Member Count: ${guild.memberCount.toLocaleString()}`;
                if (channel.name !== label) {
                    await channel.setName(label).catch((err) => {
                        if (err?.code !== 50035) console.error('[ERROR] memberCounter rename failed:', err);
                    });
                }
            } catch (err) {
                console.error('[ERROR] memberCounter tick failed:', err);
            }
        }, 5000);
    },
};
