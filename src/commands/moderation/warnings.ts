import { APIEmbedField } from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import Warning from '../../schemas/warning';

export const warnings: CommandDefinition = {
    names: ['warnings', 'warns'],
    description: 'Displays all the warns a user has. `Arguments: <id>`',
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

        // Find all warn documents for this user from the database
        const warningProfile = await Warning.find({ userId: id }).catch(console.error);
        if (!warningProfile) {
            await message.channel.send({ embeds: [createErrorEmbed('Error when searching database')] }).catch(console.error);
            return;
        }

        const fields: APIEmbedField[] = [];

        if (warningProfile.length === 0) {
            fields.push({ name: '', value: 'This user has no warnings.' });
        }

        warningProfile.forEach((warning, i) => {
            fields.push({
                name: `Warn #${i + 1}`,
                value: `__Unique ID:__ ${warning._id}\n__Reason:__ ${warning.reason}\n__Action Taken:__ ${
                    warning.actionTaken ?? 'None'
                }\n__Moderator:__ <@${warning.moderatorId}>\n__Date:__ ${warning.timestamp?.toUTCString() ?? 'Unknown'}`,
            });
        });

        const member = await message.guild.members.fetch(id).catch(console.error);
        const embed = createEmbed({
            title: 'Warnings',
            description: `User ID: \`${id}\`\nUsername: \`${member ? member.user.username : 'Not Found'}\``,
            fields,
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
