import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed, EmbedColors } from '../../lib/embed';
import { captureIdentitySnapshot } from '../../db/repositories/snapshots';
import { liftBansForUser, listActiveBansForUser } from '../../db/repositories/bans';
import { parseUserId } from '../../lib/moderation';
import { discordAuditReason } from '../../lib/moderationFormat';

export const unban: CommandDefinition = {
    names: ['unban'],
    description: 'Unbans the mentioned user. `Arguments: <id>`',
    category: CommandCategories.MODERATION,
    requiredRoleGroup: 'moderation',
    execute: async (message, args) => {
        const id = parseUserId(args[0]);
        if (!id) {
            await message.reply({ embeds: [createErrorEmbed('Please provide a valid user/id')] }).catch(console.error);
            return;
        }

        const ban = await message.guild.bans.fetch(id).catch(() => null);
        if (!ban) {
            await message.reply({ embeds: [createErrorEmbed('This user is not banned, or you provided an invalid id')] }).catch(console.error);
            return;
        }

        const activeRecords = await listActiveBansForUser(message.guild.id, id).catch(() => []);
        const actionId = activeRecords[0]?.actionId || activeRecords[0]?.id || 'Unknown';
        try {
            await message.guild.members.unban(
                id,
                discordAuditReason(actionId, message.author.username, message.author.id, 'Manual unban'),
            );
        } catch (err) {
            console.error('[ERROR] Manual unban failed:', err);
            await message.reply({ embeds: [createErrorEmbed('Discord could not unban this user. No database records were changed.')] }).catch(console.error);
            return;
        }

        try {
            const moderatorSnap = await captureIdentitySnapshot({ member: message.member, user: message.author });
            const lifted = await liftBansForUser({
                guildId: message.guild.id,
                discordUserId: id,
                liftedByModeratorSnapshotId: moderatorSnap.id,
                liftReason: 'manual',
            });
            await message.reply({
                embeds: [
                    createEmbed({
                        color: EmbedColors.SUCCESS,
                        title: 'Unbanned User',
                        description: `<@${id}> has been unbanned.`,
                        fields: [
                            { name: 'Ban Reason', value: ban.reason || 'None' },
                            { name: 'Records lifted', value: `${lifted.length}` },
                        ],
                    }),
                ],
            }).catch(console.error);
        } catch (err) {
            console.error('[ERROR] Manual unban database update failed:', err);
            await message.reply({
                embeds: [createEmbed({ color: EmbedColors.WARNING, title: 'Unbanned User', description: `<@${id}> has been unbanned, but their database records need reconciliation.` })],
            }).catch(console.error);
        }
    },
};
