export const ReactionRoles = (client) => {
    const announcementsEmoji = '📣';
    const progressEmoji = '❕';
    const eventsEmoji = '✈';

    client.on('messageReactionAdd', async (reaction, user) => {
        const roleChannel = await reaction.message.guild.channels.fetch('808791055184691211').catch(console.error);

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const { roles } = reaction.message.guild;

        const announcementsRole = await roles.fetch('808794106003193867').catch(console.error);
        const progressRole = await roles.fetch('808794053205688381').catch(console.error);
        const eventsRole = await roles.fetch('855698159257911327').catch(console.error);

        const emoji = reaction.emoji.name;
        const member = await reaction.message.guild.members.fetch(user.id).catch(console.error);

        if (emoji === announcementsEmoji) {
            await member.roles.add(announcementsRole).catch(console.error);
        } else if (emoji === progressEmoji) {
            await member.roles.add(progressRole).catch(console.error);
        } else if (emoji === eventsEmoji) {
            await member.roles.add(eventsRole).catch(console.error);
        }
    });
    client.on('messageReactionRemove', async (reaction, user) => {
        const roleChannel = await reaction.message.guild.channels.fetch('808791055184691211').catch(console.error);

        if (reaction.message.channel.id !== roleChannel.id) return;
        if (user.bot) return;

        const { roles } = reaction.message.guild;

        const announcementsRole = await roles.fetch('808794106003193867').catch(console.error);
        const progressRole = await roles.fetch('808794053205688381').catch(console.error);
        const eventsRole = await roles.fetch('855698159257911327').catch(console.error);

        const emoji = reaction.emoji.name;
        const member = await reaction.message.guild.members.fetch(user.id).catch(console.error);

        if (emoji === announcementsEmoji) {
            await member.roles.remove(announcementsRole).catch(console.error);
        } else if (emoji === progressEmoji) {
            await member.roles.remove(progressRole).catch(console.error);
        } else if (emoji === eventsEmoji) {
            await member.roles.remove(eventsRole).catch(console.error);
        }
    });
};
