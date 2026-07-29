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
    permissions: ['BanMembers'],
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('This user is not banned, or you provided an invalid id');

        const id = parseUserId(args[0]);
        if (!id) {
            await message.reply({ embeds: [createErrorEmbed('Please provide a valid user/id')] }).catch(console.error);
            return;
        }

        const ban = await message.guild.bans.fetch(id).catch(console.error);
        if (!ban) {
            await message.reply({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const reason = ban.reason || 'None';
        const activeRecords = await listActiveBansForUser(message.guild.id, id).catch(() => []);
        const actionId = activeRecords[0]?.actionId || activeRecords[0]?.id || 'Unknown';

        await message.guild.members
            .unban(id, discordAuditReason(actionId, message.author.username, message.author.id, 'Manual unban'))
            .catch(console.error);

        try {
            const moderatorSnap = await captureIdentitySnapshot({
                member: message.member,
                user: message.author,
                enrichProfile: false,
            });
            const lifted = await liftBansForUser({
                guildId: message.guild.id,
                discordUserId: id,
                liftedByModeratorSnapshotId: moderatorSnap.id,
                liftReason: 'manual',
            });

            const embed = createEmbed({
                color: EmbedColors.SUCCESS,
                title: 'Unbanned User',
                description: `<@${id}> has been unbanned.`,
                fields: [
                    { name: 'Ban Reason', value: reason },
                    { name: 'Records lifted', value: `${lifted.length}` },
                ],
            });
            await message.reply({ embeds: [embed] }).catch(console.error);
        } catch (err) {
            console.error(err);
            await message
                .reply({
                    embeds: [
                        createEmbed({
                            color: EmbedColors.WARNING,
                            title: 'Unbanned User',
                            description: `<@${id}> has been unbanned (DB lift may have failed).`,
                            fields: [{ name: 'Ban Reason', value: reason }],
                        }),
                    ],
                })
                .catch(console.error);
        }
    },
};
