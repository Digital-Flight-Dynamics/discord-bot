import { createLogEmbed } from './index';

export const startMessageLogs = (client) => {
    client.on('messageDelete', async (message) => {
        if (message.author.bot) return;

        const logChannel = message.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed('#FF0000', `Message deleted in #${message.channel.name}`, `**Content:** ${message.content}`, `User ID: ${message.author.id}`).setAuthor(
            message.author.tag,
            message.author.avatarURL(),
        );

        await logChannel.send({ embeds: [embed] }).catch((err) => console.error(err));
    });
    client.on('messageUpdate', async (oldMsg, newMsg) => {
        if (oldMsg.author.bot) return;

        const logChannel = oldMsg.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed(
            '#FFAA00',
            `Message edited in #${oldMsg.channel.name}`,
            `**Before:** ${oldMsg.content}\n**After:** ${newMsg.content}`,
            `User ID: ${oldMsg.author.id}`,
        ).setAuthor(oldMsg.author.tag, oldMsg.author.avatarURL());

        await logChannel.send({ embeds: [embed] }).catch((err) => console.error(err));
    });
};
