import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const kick: CommandDefinition = {
    names: ['kick'],
    description: 'Kicks the mentioned user. Usage: `.kick <@id> reason` (Cannot kick users not in the server)',
    category: CommandCategories.MODERATION,
    permissions: ['KICK_MEMBERS'],
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
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('You cannot kick yourself')],
                })
                .catch((err) => console.error(err));
            return;
        }

        const member = message.guild.members.cache.get(user.id);

        const reason = args.slice(1).join(' ') || 'None';

        if (!member.kickable) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Kick User').setDescription('I cannot kick this user')],
                })
                .catch((err) => console.error(err));
            return;
        }

        const dmEmbed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle(`Kicked from ${message.guild.name}`)
            .addFields({ name: 'Reason', value: `${reason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await user.send({ embeds: [dmEmbed] }).catch((err) => console.error(err));

        await member.kick().catch((err) => console.error(err));

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Kick User')
            .setDescription(`${user.tag} has been kicked.`)
            .addFields({ name: 'Reason', value: `${reason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
