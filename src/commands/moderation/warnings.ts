import { APIEmbedField } from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import { formatSnapshotLabel } from '../../db/repositories/snapshots';
import { listActiveWarnings } from '../../db/repositories/warnings';
import { parseUserId } from '../../lib/moderation';

export const warnings: CommandDefinition = {
    names: ['warnings', 'warns'],
    description: 'Displays active warnings for a user. `Arguments: <id>`',
    category: CommandCategories.MODERATION,
    permissions: ['ModerateMembers'],
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('Please provide a valid user/id');

        const id = parseUserId(args[0]);
        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        let warningProfile;
        try {
            warningProfile = await listActiveWarnings(message.guild.id, id);
        } catch (err) {
            console.error(err);
            await message.channel.send({ embeds: [createErrorEmbed('Error when searching database')] }).catch(console.error);
            return;
        }

        const fields: APIEmbedField[] = [];

        if (warningProfile.length === 0) {
            fields.push({ name: '\u200b', value: 'This user has no active warnings.' });
        }

        warningProfile.forEach((warning, i) => {
            const lines = [
                `__Action ID:__ \`${warning.actionId || warning.id}\``,
                `__Reason:__ ${warning.reason}`,
                `__Private Note:__ ${warning.privateNote ?? 'None'}`,
                `__Moderator:__ ${formatSnapshotLabel(warning.moderator)} (<@${warning.moderator?.discordUserId ?? 'unknown'}>)`,
                `__Date:__ ${warning.createdAt?.toUTCString() ?? 'Unknown'}`,
            ];
            if (warning.expiresAt) {
                lines.push(`__Expires:__ ${warning.expiresAt.toUTCString()}`);
            }
            if (warning.linkedMessageUrl) {
                lines.push(`__Message:__ [jump](${warning.linkedMessageUrl})`);
            }
            fields.push({
                name: `Warn #${i + 1}`,
                value: lines.join('\n'),
            });
        });

        const member = await message.guild.members.fetch(id).catch(console.error);
        const embed = createEmbed({
            title: 'Active Warnings',
            description: `User ID: \`${id}\`\nUsername: \`${member ? member.user.username : 'Not Found'}\``,
            fields,
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
