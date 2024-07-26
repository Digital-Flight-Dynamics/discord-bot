import { CommandDefinition, createErrorEmbed } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

export const kick: CommandDefinition = {
    names: ['kick'],
    description: 'Kicks the mentioned user. `Arguments: <id> <reason>`',
    category: CommandCategories.MODERATION,
    permissions: ['KickMembers'],
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('Please provide a valid user/id');

        let id = args[0];
        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        // in case of a mention
        if (id.startsWith('<@') && id.endsWith('>')) {
            id = id.slice(2, -1);
        }

        if (id === message.author.id) {
            await message.channel.send({ embeds: [createErrorEmbed('You cannot kick yourself')] }).catch(console.error);
            return;
        }

        const member = await message.guild.members.fetch(id).catch(console.error);
        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        if (!member.kickable) {
            await message.channel.send({ embeds: [createErrorEmbed('I cannot kick this user')] }).catch(console.error);
            return;
        }

        const kickReason = args.slice(1).join(' ') || 'None';

        const dmEmbed = createEmbed({
            title: `Kicked from ${message.guild.name}`,
            fields: [
                { name: 'Reason', value: `${kickReason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
            ],
        });

        await member.send({ embeds: [dmEmbed] }).catch(console.error);

        await member.kick().catch(console.error);

        const embed = createEmbed({
            title: 'Kicked User',
            description: `<@${id}> has been kicked.`,
            fields: [{ name: 'Reason', value: `${kickReason}`, inline: true }],
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
