import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../..';

export const kick: CommandDefinition = {
    names: ['kick'],
    description: 'Kicks the mentioned user. Usage: `.kick @mention reason` | `.kick id reason`',
    category: CommandCategories.MODERATION,
    permissions: ['KICK_MEMBERS'],
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('Please enter a valid user/id');

        const user = message.mentions.users.first();
        let id = undefined;

        if (user) {
            id = user.id;
        } else {
            id = args[0];
        }

        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        if (id === message.author.id) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('You cannot kick yourself')],
                })
                .catch(console.error);
            return;
        }

        let shouldReturn = false;

        const member = await message.guild.members.fetch(id).catch(async (err) => {
            console.error(err);
            const errString = err.toString();
            if (errString.includes('Unknown User')) {
                await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
                shouldReturn = true;
            } else if (errString.includes('Invalid Form Body')) {
                await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
                shouldReturn = true;
            }
        });

        if (shouldReturn) return;
        shouldReturn = false;

        if (!member) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('The given user is not in this server')],
                })
                .catch(console.error);
            return;
        }

        if (!member.kickable) {
            await message.channel.send({ embeds: [createErrorEmbed('I cannot kick this user')] }).catch(console.error);
            return;
        }

        const kickReason = args.slice(1).join(' ') || 'None';

        const dmEmbed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle(`Kicked from ${message.guild.name}`)
            .addFields({ name: 'Reason', value: `${kickReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await member.send({ embeds: [dmEmbed] }).catch(console.error);

        await member.kick().catch(async (err) => {
            console.error(err);
            const errString = err.toString();
            if (errString.includes('Missing Permissions')) {
                await message.channel.send({ embeds: [createErrorEmbed('I cannot kick this user')] }).catch(console.error);
                shouldReturn = true;
            }
        });

        if (shouldReturn) return;

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Kicked User')
            .setDescription(`<@${id}> has been kicked.`)
            .addFields({ name: 'Reason', value: `${kickReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
