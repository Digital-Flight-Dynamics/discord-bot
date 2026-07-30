import { CommandCategories, CommandDefinition, createErrorEmbed } from '../definitions';
import { createEmbed, EmbedColors } from '../../lib/embed';
import { captureIdentitySnapshot, formatSnapshotLabel } from '../../db/repositories/snapshots';
import { findWarningByIdOrLegacy, softRemoveWarning } from '../../db/repositories/warnings';
import { moderationTextForEmbed } from '../../lib/moderationLimits';

export const removewarning: CommandDefinition = {
    names: ['removewarning', 'rmwarn', 'deletewarning', 'delwarn'],
    description: 'Soft-removes a warning by Action ID, UUID, or legacy Mongo id. `Arguments: <id>`',
    category: CommandCategories.MODERATION,
    requiredRoleGroup: 'moderation',
    execute: async (message, args) => {
        const id = args[0];
        if (!id) {
            await message.channel.send({ embeds: [createErrorEmbed('Please provide a warning id')] }).catch(console.error);
            return;
        }

        try {
            const existing = await findWarningByIdOrLegacy(id, message.guild.id);
            if (!existing) {
                await message.channel.send({ embeds: [createErrorEmbed('Invalid ID')] }).catch(console.error);
                return;
            }

            const moderatorSnap = await captureIdentitySnapshot({
                member: message.member,
                user: message.author,
            });

            const removed = await softRemoveWarning(existing.id, message.guild.id, moderatorSnap.id);
            if (!removed) {
                await message.channel.send({ embeds: [createErrorEmbed('Invalid ID')] }).catch(console.error);
                return;
            }

            const embed = createEmbed({
                color: EmbedColors.SUCCESS,
                title: 'Cleared Warning',
                description: `User ID: \`${existing.subject.discordUserId}\`\nUsername: \`${existing.subject.username ?? 'Not Found'}\``,
                fields: [
                    { name: 'Action ID', value: `\`${removed.actionId || removed.id}\``, inline: false },
                    { name: 'Reason', value: moderationTextForEmbed(removed.reason, removed.actionId || removed.id), inline: true },
                    { name: 'Private Note', value: moderationTextForEmbed(removed.privateNote, removed.actionId || removed.id), inline: true },
                    {
                        name: 'Moderator (original)',
                        value: existing.moderator
                            ? `${formatSnapshotLabel(existing.moderator)} (<@${existing.moderator.discordUserId}>)`
                            : 'Unknown',
                        inline: true,
                    },
                    {
                        name: 'Removed by',
                        value: formatSnapshotLabel(moderatorSnap),
                        inline: true,
                    },
                ],
            });

            await message.channel.send({ embeds: [embed] }).catch(console.error);
        } catch (err) {
            console.error(err);
            await message.channel.send({ embeds: [createErrorEmbed('Failed to remove warning')] }).catch(console.error);
        }
    },
};
