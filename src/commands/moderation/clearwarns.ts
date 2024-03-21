import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import Warn from '../../schemas/warn';

export const clearwarns: CommandDefinition = {
    names: ['clearwarns'],
    description: 'Clears the specified number of warns a user has. `Arguments: <id> <count>`',
    category: CommandCategories.MODERATION,
    permissions: ['ModerateMembers'],
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
            await message.channel.send({ embeds: [createErrorEmbed('You cannot clear your own warns')] }).catch(console.error);
            return;
        }

        const member = await message.guild.members.fetch(id).catch(console.error);
        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        // Check from the database how many warns the user has
        const warnProfile = await Warn.find({ userId: id }).catch(console.error);
        if (!warnProfile) {
            await message.channel.send({ embeds: [createErrorEmbed('Error when searching database')] }).catch(console.error);
            return;
        }
        const warnCount = warnProfile.length;

        const countCleared = Math.min(parseInt(args[1]), warnCount);

        // Clear the warns
        for (let i = 0; i < countCleared; i++) {
            await Warn.findOneAndDelete({ userId: id }).catch(console.error);
        }

        const embed = createEmbed({
            title: 'Cleared Warns',
            description: `<@${id}>`,
            fields: [
                { name: 'Cleared', value: `${countCleared}`, inline: true },
                { name: 'Updated Warn Count', value: `${warnCount - countCleared}`, inline: true },
            ],
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
