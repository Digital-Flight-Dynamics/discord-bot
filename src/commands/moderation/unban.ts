import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const unban: CommandDefinition = {
    names: ['unban'],
    description: 'Unbans the mentioned user. Usage: `.unban ID`',
    category: CommandCategories.MODERATION,
    permissions: ['BAN_MEMBERS'],
    execute: async (message, args) => {
        const id = args[0];

        const invalidEmbed = new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setTitle('Error')
            .setDescription('This user is not banned, or you entered an invalid ID');

        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] });
            return;
        }

        const ban = await message.guild.bans.fetch(id).catch((err) => console.log(err));

        if (!ban) {
            await message.channel.send({ embeds: [invalidEmbed] });
            return;
        }

        let shouldReturn = false;

        await message.guild.members.unban(id).catch(async (err) => {
            if (err.toString().includes('Unknown User')) {
                await message.channel.send({ embeds: [invalidEmbed] });
                shouldReturn = true;
            }
        });

        if (shouldReturn) return;

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Unban User')
            .setDescription(`<@${id}> has been unbanned.`)
            .addFields({ name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await message.channel.send({ embeds: [embed] });
    },
};
