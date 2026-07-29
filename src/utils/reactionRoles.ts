import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { UtilDefinition } from '.';
import { channels, emojis, roles } from '../config';

export const addRole: UtilDefinition = {
    event: 'messageReactionAdd',
    execute: async (reaction: MessageReaction, user: User) => {
        const guild = reaction.message.guild;
        if (!guild) return;
        const roleChannel = await guild.channels.fetch(channels.roles).catch(console.error);

        if (!roleChannel) {
            console.error('Error: Could not find channel #roles');
            return;
        }

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const { roles: guildRoles } = guild;

        const announcementsRole = await guildRoles.fetch(roles.announcements).catch(console.error);
        const progressRole = await guildRoles.fetch(roles.progress).catch(console.error);
        const eventsRole = await guildRoles.fetch(roles.events).catch(console.error);

        if (!announcementsRole) {
            console.error('Error: Could not find announcements role');
            return;
        }
        if (!progressRole) {
            console.error('Error: Could not find progress role');
            return;
        }
        if (!eventsRole) {
            console.error('Error: Could not find events role');
            return;
        }

        const emoji = reaction.emoji.name;
        const member = await guild.members.fetch(user.id).catch(console.error);
        if (!member) return;

        if (emoji === emojis.announcement) {
            await member.roles.add(announcementsRole).catch(console.error);
        } else if (emoji === emojis.progress) {
            await member.roles.add(progressRole).catch(console.error);
        } else if (emoji === emojis.events) {
            await member.roles.add(eventsRole).catch(console.error);
        }
    },
};
export const removeRole: UtilDefinition = {
    event: 'messageReactionRemove',
    execute: async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
        const guild = reaction.message.guild;
        if (!guild) return;
        const roleChannel = await guild.channels.fetch(channels.roles).catch(console.error);

        if (!roleChannel) {
            console.error('Error: Could not find channel #roles');
            return;
        }

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const { roles: guildRoles } = guild;

        const announcementsRole = await guildRoles.fetch(roles.announcements).catch(console.error);
        const progressRole = await guildRoles.fetch(roles.progress).catch(console.error);
        const eventsRole = await guildRoles.fetch(roles.events).catch(console.error);

        if (!announcementsRole) {
            console.error('Error: Could not find announcements role');
            return;
        }
        if (!progressRole) {
            console.error('Error: Could not find progress role');
            return;
        }
        if (!eventsRole) {
            console.error('Error: Could not find events role');
            return;
        }

        const emoji = reaction.emoji.name;
        const member = await guild.members.fetch(user.id).catch(console.error);
        if (!member) return;

        if (emoji === emojis.announcement) {
            await member.roles.remove(announcementsRole).catch(console.error);
        } else if (emoji === emojis.progress) {
            await member.roles.remove(progressRole).catch(console.error);
        } else if (emoji === emojis.events) {
            await member.roles.remove(eventsRole).catch(console.error);
        }
    },
};
