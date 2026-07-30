import { TextChannel } from 'discord.js';
import { channels, roles } from '../config';
import type { UtilDefinition } from '.';

export const joinMessages: UtilDefinition<'guildMemberAdd'> = {
    event: 'guildMemberAdd',
    execute: async (member) => {
        const memberRole =
            (roles.member && (await member.guild.roles.fetch(roles.member).catch(() => null))) ||
            member.guild.roles.cache.find((r) => r.name === 'Member');

        const arrivals =
            (member.guild.channels.cache.get(channels.memberArrivals) as TextChannel | undefined) ||
            (member.guild.channels.cache.find((c) => c.name === 'arrivals') as TextChannel | undefined);

        if (!arrivals) {
            console.error('Error: Failed to find arrivals channel');
            return;
        }
        if (!memberRole) {
            console.error('Error: Failed to find Member role');
            return;
        }

        if (!arrivals.isTextBased()) return;

        await arrivals.send(`Hello ${member.user}, welcome to ${member.guild}!`).catch(console.error);
        await member.roles.add(memberRole);
    },
};
export const leaveMessages: UtilDefinition<'guildMemberRemove'> = {
    event: 'guildMemberRemove',
    execute: async (member) => {
        const leaves =
            (member.guild.channels.cache.get(channels.memberDepartures) as TextChannel | undefined) ||
            (member.guild.channels.cache.find((c) => c.name === 'leaves') as TextChannel | undefined);

        if (!leaves) {
            console.error('Error: Failed to find leaves channel');
            return;
        }

        if (!leaves.isTextBased()) return;

        await leaves.send(`User \`${member.user.username}\` (${member.user.id}) just left the server :(`).catch(console.error);
    },
};
