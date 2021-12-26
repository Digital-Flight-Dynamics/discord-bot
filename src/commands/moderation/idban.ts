import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const idban: CommandDefinition = {
    names: ['idban'],
    description:
        'Bans the user associated to the given ID. Usage: `.idban ID`' +
        '(This should only be used **for banning users outside the server.** For members inside the server, please refer to `.ban`.)',
    category: CommandCategories.MODERATION,
    permissions: ['BAN_MEMBERS'],
    execute: async (message, args) => {
        const id = args[0];

        const invalidEmbed = new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('Please enter a valid user ID');

        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch((err) => console.error(err));
            return;
        }

        const banReason = args.slice(1).join(' ') || 'None';

        let shouldReturn = false;

        const member = await message.guild.members.fetch(id).catch(async (err) => {
            console.error(err);
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

        if (member) {
            invalidEmbed.setDescription('For banning users inside the server, please refer to `.ban`');
            await message.channel.send({ embeds: [invalidEmbed] }).catch((err) => console.error(err));
            return;
        }

        await message.guild.members.ban(id, { reason: banReason }).catch((err) => console.error(err));

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Ban User')
            .setDescription(`<@${id}> has been banned.`)
            .addFields({ name: 'Reason', value: `${banReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
