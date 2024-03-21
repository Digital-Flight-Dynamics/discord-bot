import { APIEmbedField } from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import Warn from '../../schemas/warn';

export const getwarns: CommandDefinition = {
    names: ['getwarns'],
    description: 'Displays all the warns a user has. `Arguments: <id>`',
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

        const member = await message.guild.members.fetch(id).catch(console.error);
        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        // Find all warn documents for this user from the database
        const warnProfile = await Warn.find({ userId: id }).catch(console.error);
        if (!warnProfile) {
            await message.channel.send({ embeds: [createErrorEmbed('Error when searching database')] }).catch(console.error);
            return;
        }

        const fields: APIEmbedField[] = [];

        if (warnProfile.length === 0) {
            fields.push({ name: 'No Warns', value: '' });
        }

        warnProfile.forEach((warn, i) => {
            fields.push({ name: `Warn ${i + 1}`, value: `Reason: ${warn.reason}\nModerator: <@${warn.moderatorId}>` });
        });

        const embed = createEmbed({
            title: 'Warn Info',
            description: `<@${id}>`,
            fields,
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
