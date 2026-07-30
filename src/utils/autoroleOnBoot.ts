import { Client, GuildMember } from 'discord.js';
import { UtilDefinition } from './index';
import { config, roles } from '../config';

export const autoroleOnBoot: UtilDefinition<'clientReady'> = {
    event: 'clientReady',
    execute: async (client: Client) => {
        try {
            const guild =
                client.guilds.cache.get(config.guildId || '') ||
                (config.guildId ? await client.guilds.fetch(config.guildId).catch(() => null) : null);
            if (!guild) return;

            if (!roles.member) {
                console.error('Error: config.roles.member is not set');
                return;
            }

            const members = await guild.members.fetch();
            const role = await guild.roles.fetch(roles.member);
            if (!role) return;

            for (const member of members.values() as Iterable<GuildMember>) {
                if (member.roles.cache.size === 1 && !member.user.bot) {
                    await member.roles.add(role).catch(console.error);
                }
            }
        } catch (error) {
            console.error('[ERROR] Autorole startup failed:', error);
        }
    },
};
