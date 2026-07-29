import { Client, GuildMember } from 'discord.js';
import { UtilDefinition } from './index';
import { roles } from '../config';

export const autoroleOnBoot: UtilDefinition = {
    event: 'clientReady',
    execute: async (client: Client) => {
        const guild = client.guilds.cache.first();
        if (!guild) return;

        if (!roles.member) {
            console.error('Error: config.roles.member is not set');
            return;
        }

        const members = await guild.members.fetch();
        const role = await guild.roles.fetch(roles.member);
        if (!role) return;

        members.forEach(async (member: GuildMember) => {
            if (member.roles.cache.size === 1 && !member.user.bot) {
                await member.roles.add(role).catch(console.error);
            }
        });
    },
};
