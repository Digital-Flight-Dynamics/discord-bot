import type { Client, GuildMember } from 'discord.js';
import type { UtilDefinition } from './index';

const DEFAULT_ROLE_ID = '808792283515191326';

export const autoroleOnBoot: UtilDefinition = {
    event: 'ready',
    execute: async (client: Client) => {
        const guild = client.guilds.cache.first();
        if (!guild) return;

        const members = await guild.members.fetch();
        const role = await guild.roles.fetch(DEFAULT_ROLE_ID);
        if (!role) return;

        members.forEach(async (member: GuildMember) => {
            if (member.roles.cache.size === 1 && !member.user.bot) {
                await member.roles.add(role).catch(console.error);
            }
        });
    },
};
