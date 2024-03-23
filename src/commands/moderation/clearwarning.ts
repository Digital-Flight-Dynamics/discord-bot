import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import Warning from '../../schemas/warning';

export const clearwarning: CommandDefinition = {
    names: ['clearwarning', 'clearwarn'],
    description: 'Clears the warning using its unique id. `Arguments: <unique_id>`',
    category: CommandCategories.MODERATION,
    permissions: ['ModerateMembers'],
    execute: async (message, args) => {
        const id = args[0];

        // Check from the database how many warns the user has
        const warning = await Warning.findById(id).catch(console.error);
        if (!warning) {
            await message.channel.send({ embeds: [createErrorEmbed('Invalid ID')] }).catch(console.error);
            return;
        }

        // Delete the warn
        await Warning.findByIdAndDelete(id).catch(console.error);

        const member = await message.guild.members.fetch(warning.userId).catch(console.error);
        const embed = createEmbed({
            title: `Cleared Warning`,
            description: `User ID: \`${warning.userId}\`\nUsername: \`${member ? member.user.username : 'Not Found'}\``,
            fields: [
                { name: 'Reason', value: `${warning.reason}`, inline: true },
                { name: 'Action Taken', value: `${warning.actionTaken ?? 'None'}`, inline: true },
                { name: 'Moderator', value: `<@${warning.moderatorId}>`, inline: true },
            ],
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
