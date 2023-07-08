import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../..';

export const timeout: CommandDefinition = {
    names: ['timeout'],
    description: 'Timeouts the mentioned user. Usage: `.timeout @mention reason` | `.timeout id reason`',
    category: CommandCategories.MODERATION,
    permissions: ['MuteMembers'],
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
                    embeds: [createErrorEmbed('You cannot timeout yourself')],
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

        if (!member.manageable) {
            await message.channel.send({ embeds: [createErrorEmbed('I cannot timeout this user')] }).catch(console.error);
            return;
        }

        const kickReason = args.slice(1).join(' ') || 'None';

        const dmEmbed = new Discord.EmbedBuilder()
            .setColor(color)
            .setTitle(`Timeout from ${message.guild.name}`)
            .addFields({ name: 'Reason', value: `${kickReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await member.send({ embeds: [dmEmbed] }).catch(console.error);

        await member.kick().catch(console.error);

        if (shouldReturn) return;

        const embed = new Discord.EmbedBuilder()
            .setColor(color)
            .setTitle('Put User in Timeout')
            .setDescription(`<@${id}> has been put in timeout.`)
            .addFields({ name: 'Reason', value: `${kickReason}`, inline: true }, { name: 'Moderator', value: `${message.author.tag}`, inline: true });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};

const argToMs = (arg: string): number => {
    const num = parseInt(arg.slice(0, -1));
    console.log(num);
    return 0;
    if (isNaN(num)) return 0;
    if (arg.endsWith('s')) return num * 1000;
    if (arg.endsWith('m')) return num * 1000 * 60;
    if (arg.endsWith('h')) return num * 1000 * 60 * 60;
    if (arg.endsWith('d')) return num * 1000 * 60 * 60 * 24;
    return 0;
};
