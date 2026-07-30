import { Client } from 'discord.js';
import { UtilDefinition } from '.';
import { channels, config } from '../config';
import { isUnsetSnowflake } from '../config/channelNames';
import { logMissingRequiredChannel } from '../config/errors';
import { isSoftLocked } from '../runtime/softLock';

function resolveGuild(client: Client) {
    if (config.guildId && !isUnsetSnowflake(config.guildId)) {
        const byConfig = client.guilds.cache.get(config.guildId);
        if (byConfig) return byConfig;
    }
    return undefined;
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

let memberCounterTimer: NodeJS.Timeout | null = null;

export function stopMemberCounter(): void {
    if (memberCounterTimer) clearInterval(memberCounterTimer);
    memberCounterTimer = null;
}

export const memberCounter: UtilDefinition<'clientReady'> = {
    event: 'clientReady',
    execute: (client: Client) => {
        stopMemberCounter();
        let missingLogged = false;
        let running = false;

        memberCounterTimer = setInterval(async () => {
            if (running) return;
            running = true;
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
            } finally {
                running = false;
            }
        }, 5000);
    },
};
