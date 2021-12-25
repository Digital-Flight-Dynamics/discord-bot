export const ReactionRoles = (client) => {
    const announcementsEmoji = '📣';
    const progressEmoji = '❕';
    const eventsEmoji = '✈';

    client.on('messageReactionAdd', async (reaction, user) => {
        const roleChannel = reaction.message.guild.channels.cache.find((c) => c.name === 'roles');

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const roleCache = reaction.message.guild.roles.cache;

        const announcementsRole = roleCache.find((role) => role.name === 'Server Announcements');
        const progressRole = roleCache.find((role) => role.name === 'Progress Updates');
        const eventsRole = roleCache.find((role) => role.name === 'Event Announcements');

        const emoji = reaction.emoji.name;
        const member = await reaction.message.guild.members.fetch(user.id).catch((err) => console.error(err));

        if (emoji === announcementsEmoji) {
            await member.roles.add(announcementsRole).catch((err) => console.error(err));
        } else if (emoji === progressEmoji) {
            await member.roles.add(progressRole).catch((err) => console.error(err));
        } else if (emoji === eventsEmoji) {
            await member.roles.add(eventsRole).catch((err) => console.error(err));
        }
    });
    client.on('messageReactionRemove', async (reaction, user) => {
        const roleChannel = reaction.message.guild.channels.cache.find((c) => c.name === 'roles');

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const roleCache = reaction.message.guild.roles.cache;

        const announcementsRole = roleCache.find((role) => role.name === 'Server Announcements');
        const progressRole = roleCache.find((role) => role.name === 'Progress Updates');
        const eventsRole = roleCache.find((role) => role.name === 'Event Announcements');

        const emoji = reaction.emoji.name;
        const member = await reaction.message.guild.members.fetch(user.id).catch((err) => console.error(err));

        if (emoji === announcementsEmoji) {
            await member.roles.remove(announcementsRole).catch((err) => console.error(err));
        } else if (emoji === progressEmoji) {
            await member.roles.remove(progressRole).catch((err) => console.error(err));
        } else if (emoji === eventsEmoji) {
            await member.roles.remove(eventsRole).catch((err) => console.error(err));
        }
    });
};
