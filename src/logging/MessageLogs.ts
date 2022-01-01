import Discord from 'discord.js';
import { createLogEmbed } from './index';

export const startMessageLogs = (client) => {
    client.on('messageDelete', async (message) => {
        if (!message.author) {
            console.error('Message delete log attmempted. Error: Message author is undefined, returning');
            return;
        }
        if (message.author.bot) return;

        const logChannel = message.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed('#FF0000', `Message deleted in #${message.channel.name}`, `**Content:** ${message.content}`, `User ID: ${message.author.id}`).setAuthor(
            message.author.tag,
            message.author.avatarURL(),
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
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

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
    client.on('messageDeleteBulk', async (messages) => {
        const embed = new Discord.MessageEmbed().setColor('#FF0000').setTimestamp();

        let logChannel = undefined;

        const desc = [];

        messages.forEach((message) => {
            desc.push(`[${message.author.tag}]: ${message.content}`);
            embed.setTitle(`${messages.size} Messages purged in #${message.channel.name}`).setFooter(`Channel ID: ${message.channel.id}`);

            logChannel = message.guild.channels.cache.find((c) => c.name === 'logs');
        });

        embed.setDescription(desc.join('\n'));

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
};
