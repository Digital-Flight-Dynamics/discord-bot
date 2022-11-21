const ANNOUNCEMENTS_EMOJI = '📣';
const PROGRESS_EMOJI = '❕';
const EVENTS_EMOJI = '✈';

export const addRole = {
    event: 'messageReactionAdd',
    execute: async (reaction, user) => {
        const roleChannel = await reaction.message.guild.channels.fetch('808791055184691211').catch(console.error);

        if (!roleChannel) {
            console.error('Error: Could not find channel #roles');
            return;
        }

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const { roles } = reaction.message.guild;

        const announcementsRole = await roles.fetch('808794106003193867').catch(console.error);
        const progressRole = await roles.fetch('808794053205688381').catch(console.error);
        const eventsRole = await roles.fetch('855698159257911327').catch(console.error);

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

        if (emoji === ANNOUNCEMENTS_EMOJI) {
            await member.roles.add(announcementsRole).catch(console.error);
        } else if (emoji === PROGRESS_EMOJI) {
            await member.roles.add(progressRole).catch(console.error);
        } else if (emoji === EVENTS_EMOJI) {
            await member.roles.add(eventsRole).catch(console.error);
        }
    },
};
export const removeRole = {
    event: 'messageReactionRemove',
    execute: async (reaction, user) => {
        const roleChannel = await reaction.message.guild.channels.fetch('808791055184691211').catch(console.error);

        if (!roleChannel) {
            console.error('Error: Could not find channel #roles');
            return;
        }

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const { roles } = reaction.message.guild;

        const announcementsRole = await roles.fetch('808794106003193867').catch(console.error);
        const progressRole = await roles.fetch('808794053205688381').catch(console.error);
        const eventsRole = await roles.fetch('855698159257911327').catch(console.error);

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

        if (emoji === ANNOUNCEMENTS_EMOJI) {
            await member.roles.remove(announcementsRole).catch(console.error);
        } else if (emoji === PROGRESS_EMOJI) {
            await member.roles.remove(progressRole).catch(console.error);
        } else if (emoji === EVENTS_EMOJI) {
            await member.roles.remove(eventsRole).catch(console.error);
        }
    },
};
