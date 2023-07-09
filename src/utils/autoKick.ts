import Discord from 'discord.js';
import { color } from '../index';
import { UtilDefinition } from '.';

const BLACKLIST = [
    'csgo',
    'cs:go',
    'cs go',
    'steam',
    'stearn',
    'kinfe',
    'knife',
    'skins',
    'giveaway',
    'free',
    'nitro',
    'discord',
    'discorcl',
    'gift',
    'first',
];

export const autoKick: UtilDefinition = {
    event: 'messageCreate',
    execute: async (message: Discord.Message) => {
        if (message.channel.type === Discord.ChannelType.DM) return;
        if (!(message.content.includes('@everyone') && !message.member.permissions.has(Discord.PermissionFlagsBits.MentionEveryone))) return;

        const member = message.guild.members.cache.get(message.author.id);

        await message.delete().catch(console.error);

        const dmEmbed = new Discord.EmbedBuilder()
            .setColor(color)
            .setTitle(`Kicked from ${message.guild.name}`)
            .addFields(
                { name: 'Reason', value: 'Kicked as a precaution - potential scam', inline: true },
                { name: 'Moderator', value: 'Automated Kick', inline: true },
            );

        let shouldKick = false;
        for (const word of BLACKLIST) {
            if (message.content.includes(word)) {
                shouldKick = true;
            }
        }
        if (!shouldKick) return;

        await member.user.send({ embeds: [dmEmbed] }).catch(console.error);
        await member.kick().catch(console.error);
    },
};
