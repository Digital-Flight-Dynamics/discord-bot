import Discord from 'discord.js';
import { color } from '../index';

export const autoKick = {
    event: 'messageCreate',
    execute: async (message) => {
        if (message.channel.type === 'DM') return;

        if (message.content.includes('@everyone') && !message.member.permissions.has('MENTION_EVERYONE')) {
            const member = message.guild.members.cache.get(message.author.id);

            await message.delete().catch(console.error);

            const blacklist = ['csgo', 'cs:go', 'cs go', 'steam', 'stearn', 'kinfe', 'knife', 'skins', 'giveaway', 'free', 'nitro', 'discord', 'discorcl'];

            const dmEmbed = new Discord.MessageEmbed()
                .setColor(color)
                .setTitle(`Kicked from ${message.guild.name}`)
                .addFields({ name: 'Reason', value: 'Kicked as a precaution - potential scam', inline: true }, { name: 'Moderator', value: 'Automated Kick', inline: true });

            let shouldKick = false;

            for (const word of blacklist) {
                if (message.content.includes(word)) {
                    shouldKick = true;
                }
            }
            if (!shouldKick) return;

            const logChannel = message.guild.channels.cache.find((c) => c.name === 'logs');
            const kickEmbed = new Discord.MessageEmbed()
                .setColor('#FF0000')
                .setTitle('User Auto-Kicked')
                .setDescription(`**User:** ${member}\n**Reason:** Kicked as a precaution - potential scam.\n**Message**: ${message.content}`)
                .setFooter(`User ID: ${member.user.id}`)
                .setTimestamp()
                .setAuthor(
                    message.author.tag,
                    message.author.avatarURL(),
                )

            await logChannel.send({ embeds: [kickEmbed] }).catch(console.error);
            await member.user.send({ embeds: [dmEmbed] }).catch(console.error);
            await member.kick().catch(console.error);
        }
    },
};
