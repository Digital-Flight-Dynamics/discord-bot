import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const ban: CommandDefinition = {
    names: ['ban'],
    description: 'Bans the mentioned user. Usage: `.ban <@id> reason` (Cannot ban users not in the server)',
    category: CommandCategories.MODERATION,
    permissions: ['BAN_MEMBERS'],
    execute: async (message, args) => {
        const user = message.mentions.users.first();

        if (!user) {
            await message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor('#FF0000')
                        .setTitle('Error')
                        .setDescription('Please mention a valid user'),
                ],
            });
            return;
        }

        const member = message.guild.members.cache.get(user.id);

        const reason = args.slice(1).join(' ') || 'None';

        if (!member.bannable) {
            await message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor('#FF0000')
                        .setTitle('Ban User')
                        .setDescription('I cannot ban this user'),
                ],
            });
            return;
        }

        const dmEmbed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle(`Banned from ${message.guild.name}`)
            .addFields(
                { name: 'Reason', value: `${reason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
            );

        await user.send({ embeds: [dmEmbed] });

        await member.ban({ reason: [reason] }).catch((err) => console.log(err));

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Ban User')
            .setDescription(`${user.tag} has been banned.`)
            .addFields(
                { name: 'Reason', value: `${reason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
            );

        await message.channel.send({ embeds: [embed] });
    },
};
