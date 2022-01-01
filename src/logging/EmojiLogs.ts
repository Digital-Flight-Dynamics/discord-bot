import { createLogEmbed } from './index';

export const startEmojiLogs = (client) => {
    client.on('emojiCreate', async (emoji) => {
        const logChannel = emoji.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed('#00FF00', 'Emoji Created', `**Name:** ${emoji.name}\n**Animated:** ${emoji.animated}`, `Emoji ID: ${emoji.id}`);

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
    client.on('emojiDelete', async (emoji) => {
        const logChannel = emoji.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed('#FF0000', 'Emoji Deleted', `**Name:** ${emoji.name}\n**Animated:** ${emoji.animated}`, `Emoji ID: ${emoji.id}`);

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
    client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
        const logChannel = oldEmoji.guild.channels.cache.find((c) => c.name === 'logs');

        if (oldEmoji.name === newEmoji.name) return;

        const embed = createLogEmbed('#FFAA00', 'Emoji Name Changed', `**Before:** ${oldEmoji.name}\n**After:** ${newEmoji.name}`, `Emoji ID: ${oldEmoji.id}`);

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
};
