import { MessageReaction, User } from 'discord.js';
import { UtilDefinition } from '.';
import { Channels, Emojis, Roles } from '../constants';

export const addRole: UtilDefinition = {
    event: 'messageReactionAdd',
    execute: async (reaction: MessageReaction, user: User) => {
        const roleChannel = await reaction.message.guild.channels.fetch(Channels.ROLES).catch(console.error);

        if (!roleChannel) {
            console.error('Error: Could not find channel #roles');
            return;
        }

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const { roles } = reaction.message.guild;

        const announcementsRole = await roles.fetch(Roles.ANNOUNCEMENTS).catch(console.error);
        const progressRole = await roles.fetch(Roles.PROGRESS).catch(console.error);
        const eventsRole = await roles.fetch(Roles.EVENTS).catch(console.error);

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
        const member = await reaction.message.guild.members.fetch(user.id).catch(console.error);
        if (!member) return;

        if (emoji === Emojis.ANNOUNCEMENT) {
            await member.roles.add(announcementsRole).catch(console.error);
        } else if (emoji === Emojis.PROGRESS) {
            await member.roles.add(progressRole).catch(console.error);
        } else if (emoji === Emojis.EVENTS) {
            await member.roles.add(eventsRole).catch(console.error);
        }
    },
};
export const removeRole = {
    event: 'messageReactionRemove',
    execute: async (reaction, user) => {
        const roleChannel = await reaction.message.guild.channels.fetch(Channels.ROLES).catch(console.error);

        if (!roleChannel) {
            console.error('Error: Could not find channel #roles');
            return;
        }

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const { roles } = reaction.message.guild;

        const announcementsRole = await roles.fetch(Roles.ANNOUNCEMENTS).catch(console.error);
        const progressRole = await roles.fetch(Roles.PROGRESS).catch(console.error);
        const eventsRole = await roles.fetch(Roles.EVENTS).catch(console.error);

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
        const member = await reaction.message.guild.members.fetch(user.id).catch(console.error);

        if (emoji === Emojis.ANNOUNCEMENT) {
            await member.roles.remove(announcementsRole).catch(console.error);
        } else if (emoji === Emojis.PROGRESS) {
            await member.roles.remove(progressRole).catch(console.error);
        } else if (emoji === Emojis.EVENTS) {
            await member.roles.remove(eventsRole).catch(console.error);
        }
    },
};
