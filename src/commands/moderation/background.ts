import { APIEmbedField } from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../definitions';
import { createEmbed } from '../../lib/embed';
import { formatSnapshotLabel } from '../../db/repositories/snapshots';
import { listAllWarnings } from '../../db/repositories/warnings';
import { listKicksForUser } from '../../db/repositories/kicks';
import { listBansForUser } from '../../db/repositories/bans';
import { listTimeoutsForUser } from '../../db/repositories/timeouts';
import { parseUserId, warningStatusLabel } from '../../lib/moderation';
import { moderationTextForEmbed } from '../../lib/moderationLimits';

const CASES_PER_TYPE = 6;

export const background: CommandDefinition = {
    names: ['background', 'bgcheck', 'infractions'],
    description: 'Full moderation background check (includes removed/expired). `Arguments: <id>`',
    category: CommandCategories.MODERATION,
    requiredRoleGroup: 'moderation',
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('Please provide a valid user/id');

        const id = parseUserId(args[0]);
        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        try {
            const guildId = message.guild.id;
            const [warns, kickRows, banRows, timeoutRows] = await Promise.all([
                listAllWarnings(guildId, id),
                listKicksForUser(guildId, id),
                listBansForUser(guildId, id),
                listTimeoutsForUser(guildId, id),
            ]);

            const fields: APIEmbedField[] = [];

            if (warns.length === 0) {
                fields.push({ name: 'Warnings', value: 'None' });
            } else {
                warns.slice(0, CASES_PER_TYPE).forEach((w, i) => {
                    const status = warningStatusLabel(w);
                    fields.push({
                        name: `Warning #${i + 1} [${status}]`,
                        value: moderationTextForEmbed(
                            [
                                `Action ID: \`${w.actionId || w.id}\``,
                                `Reason: ${w.reason}`,
                                `Private Note: ${w.privateNote ?? 'None'}`,
                                `Mod: ${formatSnapshotLabel(w.moderator)}`,
                                `Date: ${w.createdAt?.toUTCString() ?? 'Unknown'}`,
                                w.recordExpiresAt ? `Expiration: ${w.recordExpiresAt.toUTCString()}` : null,
                                w.removedAt ? `Removed: ${w.removedAt.toUTCString()}` : null,
                                w.linkedMessageUrl ? `Message: [jump](${w.linkedMessageUrl})` : null,
                            ]
                                .filter(Boolean)
                                .join('\n'), w.actionId || w.id, 1024,
                        ),
                    });
                });
            }

            if (kickRows.length === 0) {
                fields.push({ name: 'Kicks', value: 'None' });
            } else {
                kickRows.slice(0, CASES_PER_TYPE).forEach((k, i) => {
                    fields.push({
                        name: `Kick #${i + 1}${k.isAutomated ? ' [AUTO]' : ''}${k.resolutionStatus ? ` [${k.resolutionStatus}]` : ''}`,
                        value: moderationTextForEmbed(
                            [
                                `Action ID: \`${k.actionId || k.id}\``,
                                `Reason: ${k.reason}`,
                                `Private Note: ${k.privateNote ?? 'None'}`,
                                `Mod: ${k.moderator ? formatSnapshotLabel(k.moderator) : 'Automated'}`,
                                `Date: ${k.createdAt?.toUTCString() ?? 'Unknown'}`,
                                k.recordExpiresAt ? `Expiration: ${k.recordExpiresAt.toUTCString()}` : null,
                                k.linkedMessageUrl ? `Message: [jump](${k.linkedMessageUrl})` : null,
                            ]
                                .filter(Boolean)
                                .join('\n'), k.actionId || k.id, 1024,
                        ),
                    });
                });
            }

            if (banRows.length === 0) {
                fields.push({ name: 'Bans', value: 'None' });
            } else {
                banRows.slice(0, CASES_PER_TYPE).forEach((b, i) => {
                    const state = b.resolutionStatus || (b.liftedAt ? `LIFTED (${b.liftReason || 'unknown'})` : 'ACTIVE');
                    fields.push({
                        name: `Ban #${i + 1} [${b.banType.toUpperCase()}] [${state}]`,
                        value: moderationTextForEmbed(
                            [
                                `Action ID: \`${b.actionId || b.id}\``,
                                `Reason: ${b.reason}`,
                                `Private Note: ${b.privateNotes ?? 'None'}`,
                                `Mod: ${b.moderator ? formatSnapshotLabel(b.moderator) : 'Unknown'}`,
                                `Date: ${b.createdAt?.toUTCString() ?? 'Unknown'}`,
                                b.expiresAt ? `Duration ends: ${b.expiresAt.toUTCString()}` : null,
                                b.recordExpiresAt ? `Expiration: ${b.recordExpiresAt.toUTCString()}` : null,
                                b.liftedAt ? `Lifted: ${b.liftedAt.toUTCString()}` : null,
                                b.linkedMessageUrl ? `Message: [jump](${b.linkedMessageUrl})` : null,
                            ]
                                .filter(Boolean)
                                .join('\n'), b.actionId || b.id, 1024,
                        ),
                    });
                });
            }

            if (timeoutRows.length === 0) {
                fields.push({ name: 'Timeouts', value: 'None' });
            } else {
                timeoutRows.slice(0, CASES_PER_TYPE).forEach((timeout, i) => {
                    const actionId = timeout.actionId || timeout.id;
                    fields.push({
                        name: `Timeout #${i + 1}${timeout.resolutionStatus ? ` [${timeout.resolutionStatus}]` : ''}`,
                        value: moderationTextForEmbed([
                            `Action ID: \`${actionId}\``,
                            `Reason: ${timeout.reason}`,
                            `Private Note: ${timeout.privateNote ?? 'None'}`,
                            `Mod: ${formatSnapshotLabel(timeout.moderator)}`,
                            `Date: ${timeout.createdAt.toUTCString()}`,
                            timeout.expiresAt ? `Duration ends: ${timeout.expiresAt.toUTCString()}` : null,
                            timeout.recordExpiresAt ? `Expiration: ${timeout.recordExpiresAt.toUTCString()}` : null,
                        ].filter(Boolean).join('\n'), actionId, 1024),
                    });
                });
            }

            const member = await message.guild.members.fetch(id).catch(console.error);
            const embed = createEmbed({
                title: 'Background Check',
                description: `User ID: \`${id}\`\nUsername: \`${member ? member.user.username : 'Not Found'}\`\nWarnings: ${
                    warns.length
                } · Kicks: ${kickRows.length} · Bans: ${banRows.length} · Timeouts: ${timeoutRows.length}`,
                fields,
            });

            await message.channel.send({ embeds: [embed] }).catch(console.error);
        } catch (err) {
            console.error(err);
            await message.channel.send({ embeds: [createErrorEmbed('Error when searching database')] }).catch(console.error);
        }
    },
};
