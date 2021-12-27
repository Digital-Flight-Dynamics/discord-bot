import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../..';

export const ban: CommandDefinition = {
    names: ['ban'],
    description: 'Bans the mentioned user. Usage: `.ban @mention reason` | `.ban ID reason`',
    category: CommandCategories.MODERATION,
    permissions: ['BAN_MEMBERS'],
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
            await message.channel.send({ embeds: [invalidEmbed] }).catch((err) => console.error(err));
            return;
        }

        if (id === message.author.id) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('You cannot ban yourself')],
                })
                .catch((err) => console.error(err));
            return;
        }

        let shouldReturn = false;

        const member = await message.guild.members.fetch(id).catch(async (err) => {
            const errString = err.toString();
            if (errString.includes('Unknown User')) {
                await message.channel.send({ embeds: [invalidEmbed] }).catch((err) => console.error(err));
                shouldReturn = true;
            } else if (errString.includes('Invalid Form Body')) {
                await message.channel.send({ embeds: [invalidEmbed] }).catch((err) => console.error(err));
                shouldReturn = true;
            }
        });

        if (shouldReturn) return;
        shouldReturn = false;

        const banReason = args.slice(1).join(' ') || 'None';

        if (member) {
            if (!member.bannable) {
                await message.channel.send({ embeds: [createErrorEmbed('I cannot ban this user')] }).catch((err) => console.error(err));
                return;
            }

            const dmEmbed = new Discord.MessageEmbed()
                .setColor(color)
                .setTitle(`Banned from ${message.guild.name}`)
                .addFields({ name: 'Reason', value: `${banReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

            await member.send({ embeds: [dmEmbed] }).catch((err) => console.error(err));
        }

        await message.guild.members.ban(id, { reason: banReason }).catch(async (err) => {
            const errString = err.toString();
            if (errString.includes('Missing Permissions')) {
                await message.channel.send({ embeds: [createErrorEmbed('I cannot ban this user')] }).catch((err) => console.error(err));
                shouldReturn = true;
            }
        });

        if (shouldReturn) return;

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Ban User')
            .setDescription(`<@${id}> has been banned.`)
            .addFields({ name: 'Reason', value: `${banReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
