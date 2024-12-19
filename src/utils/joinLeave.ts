import { GuildMember } from 'discord.js';

export const joinMessages = {
    event: 'guildMemberAdd',
    execute: async (member: GuildMember) => {
        const memberRole = member.guild.roles.cache.find((r) => r.name === 'Member');
        const arrivals = member.guild.channels.cache.find((c) => c.name === 'arrivals');

        if (!arrivals) {
            console.error('Error: Failed to find channel #arrivals');
            return;
        }
        if (!memberRole) {
            console.error('Error: Failed to find role "Member"');
            return;
        }

        if (!arrivals.isTextBased()) return;

        await arrivals.send(`Hello ${member.user}, welcome to ${member.guild}!`).catch(console.error);
        await member.roles.add(memberRole);
    },
};
export const leaveMessages = {
    event: 'guildMemberRemove',
    execute: async (member: GuildMember) => {
        const leaves = member.guild.channels.cache.find((c) => c.name === 'leaves');

        if (!leaves) {
            console.error('Error: Failed to find channel #leaves');
            return;
        }

        if (!leaves.isTextBased()) return;

        await leaves.send(`User \`${member.user.username}\` (${member.user.id}) just left the server :(`).catch(console.error);
    },
};
