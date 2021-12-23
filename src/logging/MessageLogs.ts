const { createLogEmbed } = require('./index.ts');

module.exports = {
    startMessageLogs(client) {
        client.on('messageDelete', async (message) => {
            if (message.author.bot) return;
            const logChannel = message.guild.channels.cache.find((c) => c.name === 'logs');
            const embed = createLogEmbed(
                `Message deleted in #${message.channel.name}`,
                `**Content:** ${message.content}`,
                `User ID: ${message.author.id}`,
            ).setAuthor(message.author.tag, message.author.avatarURL());

            await logChannel.send({ embeds: [embed] });
        });
        client.on('messageUpdate', async (oldMsg, newMsg) => {
            const logChannel = oldMsg.guild.channels.cache.find((c) => c.name === 'logs');
            const embed = createLogEmbed(
                `Message edited in #${oldMsg.channel.name}`,
                `**Before:** ${oldMsg.content}\n**After:** ${newMsg.content}`,
                `User ID: ${oldMsg.author.id}`,
            ).setAuthor(oldMsg.author.tag, oldMsg.author.avatarURL());

            await logChannel.send({ embeds: [embed] });
        });
    },
};
