import Discord from 'discord.js';
import { color } from '../index';

export const AutoKick = async (message) => {
    if (message.content.includes('@everyone') && !message.member.permissions.has('MENTION_EVERYONE')) {
        const member = message.guild.members.cache.get(message.author.id);

        await message.delete().catch((err) => console.error(err));

        const blacklist = ['csgo', 'cs:go', 'cs go', 'steam', 'stearn', 'kinfe', 'knife', 'skins', 'giveaway', 'free', 'nitro', 'discord', 'discorcl'];

        const dmEmbed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle(`Kicked from ${message.guild.name}`)
            .addFields({ name: 'Reason', value: 'Kicked as a precaution - potential scam', inline: true }, { name: 'Moderator', value: 'Automated Kick', inline: true })
            .setFooter('If this was a mistake, you can join back. https://discord.gg/dfd');

        let shouldKick = false;

        for (const word of blacklist) {
            if (message.content.includes(word)) {
                shouldKick = true;
            }
        }
        if (!shouldKick) return;

        await member.user.send({ embeds: [dmEmbed] }).catch((err) => console.error(err));
        await member.kick().catch((err) => console.error(err));
    }
};
