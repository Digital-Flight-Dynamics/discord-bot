import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../..';

export const unban: CommandDefinition = {
    names: ['unban'],
    description: 'Unbans the mentioned user. Usage: `.unban id`',
    category: CommandCategories.MODERATION,
    permissions: ['BAN_MEMBERS'],
    execute: async (message, args) => {
        const id = args[0];

        const invalidEmbed = createErrorEmbed('This user is not banned, or you entered an invalid ID');

        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const ban = await message.guild.bans.fetch(id).catch(console.error);

        if (!ban) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        let shouldReturn = false;

        await message.guild.members.unban(id).catch(async (err) => {
            console.error(err);

            if (err.toString().includes('Unknown User')) {
                await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
                shouldReturn = true;
            }
        });

        if (shouldReturn) return;

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Unbanned User')
            .setDescription(`<@${id}> has been unbanned.`)
            .addFields({ name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
