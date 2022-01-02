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

            await member.user.send({ embeds: [dmEmbed] }).catch(console.error);
            await member.kick().catch(console.error);
        }
    },
};
