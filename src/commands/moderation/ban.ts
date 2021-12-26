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
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('Please mention a valid user')],
                })
                .catch((err) => console.error(err));
            return;
        }

        if (user.id === message.author.id) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('You cannot ban yourself')],
                })
                .catch((err) => console.error(err));
            return;
        }

        const member = message.guild.members.cache.get(user.id);

        const banReason = args.slice(1).join(' ') || 'None';

        if (!member.bannable) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Ban User').setDescription('I cannot ban this user')],
                })
                .catch((err) => console.error(err));
            return;
        }

        const dmEmbed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle(`Banned from ${message.guild.name}`)
            .addFields({ name: 'Reason', value: `${banReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await user.send({ embeds: [dmEmbed] }).catch((err) => console.error(err));

        await member.ban({ reason: banReason }).catch((err) => console.error(err));

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Ban User')
            .setDescription(`${user.tag} has been banned.`)
            .addFields({ name: 'Reason', value: `${banReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
