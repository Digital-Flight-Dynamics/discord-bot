import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const idban: CommandDefinition = {
    names: ['idban'],
    description:
        'Bans the user associated to the given ID. Usage: `.idban ID` (Works for users outside the server, unlike .ban)',
    category: CommandCategories.MODERATION,
    permissions: ['BAN_MEMBERS'],
    execute: async (message, args) => {
        const id = args[0];

        const invalidEmbed = new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Error')
            .setDescription('Please enter a valid user ID');

        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] });
            return;
        }

        const reason = args.slice(1).join(' ') || 'None';

        let shouldReturn = false;

        await message.guild.members.ban(id, { reason: [reason] }).catch(async (err) => {
            const errString = err.toString();
            if (errString.includes('Unknown User') || errString.includes('Invalid Form Body')) {
                await message.channel.send({ embeds: [invalidEmbed] });
                shouldReturn = true;
            }
        });

        if (shouldReturn) return;

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Ban User')
            .setDescription(`<@${id}> has been banned.`)
            .addFields(
                { name: 'Reason', value: `${reason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
            );

        await message.channel.send({ embeds: [embed] });
    },
};
