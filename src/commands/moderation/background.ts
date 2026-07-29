import { APIEmbedField } from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import { formatSnapshotLabel } from '../../db/repositories/snapshots';
import { listAllWarnings } from '../../db/repositories/warnings';
import { listKicksForUser } from '../../db/repositories/kicks';
import { listBansForUser } from '../../db/repositories/bans';
import { parseUserId, warningStatusLabel } from '../../lib/moderation';

const MAX_FIELD_VALUE = 1024;

function fieldValue(value: string): string {
    return value.length > MAX_FIELD_VALUE ? `${value.slice(0, MAX_FIELD_VALUE - 1)}…` : value;
}

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
            const [warns, kickRows, banRows] = await Promise.all([
                listAllWarnings(guildId, id),
                listKicksForUser(guildId, id),
                listBansForUser(guildId, id),
            ]);

            const fields: APIEmbedField[] = [];

            if (warns.length === 0) {
                fields.push({ name: 'Warnings', value: 'None' });
            } else {
                warns.slice(0, 10).forEach((w, i) => {
                    const status = warningStatusLabel(w);
                    fields.push({
                        name: `Warning #${i + 1} [${status}]`,
                        value: fieldValue(
                            [
                                `ID: \`${w.id}\``,
                                `Reason: ${w.reason}`,
                                `Private Note: ${w.privateNote ?? 'None'}`,
                                `Mod: ${formatSnapshotLabel(w.moderator)}`,
                                `Date: ${w.createdAt?.toUTCString() ?? 'Unknown'}`,
                                w.expiresAt ? `Expires: ${w.expiresAt.toUTCString()}` : null,
                                w.removedAt ? `Removed: ${w.removedAt.toUTCString()}` : null,
                                w.linkedMessageUrl ? `Message: [jump](${w.linkedMessageUrl})` : null,
                            ]
                                .filter(Boolean)
                                .join('\n'),
                        ),
                    });
                });
                if (warns.length > 10) {
                    fields.push({ name: 'Warnings (more)', value: `…and ${warns.length - 10} more` });
                }
            }

            if (kickRows.length === 0) {
                fields.push({ name: 'Kicks', value: 'None' });
            } else {
                kickRows.slice(0, 5).forEach((k, i) => {
                    fields.push({
                        name: `Kick #${i + 1}${k.isAutomated ? ' [AUTO]' : ''}`,
                        value: fieldValue(
                            [
                                `ID: \`${k.id}\``,
                                `Reason: ${k.reason}`,
                                `Private Note: ${k.privateNote ?? 'None'}`,
                                `Mod: ${k.moderator ? formatSnapshotLabel(k.moderator) : 'Automated'}`,
                                `Date: ${k.createdAt?.toUTCString() ?? 'Unknown'}`,
                                k.linkedMessageUrl ? `Message: [jump](${k.linkedMessageUrl})` : null,
                            ]
                                .filter(Boolean)
                                .join('\n'),
                        ),
                    });
                });
            }

            if (banRows.length === 0) {
                fields.push({ name: 'Bans', value: 'None' });
            } else {
                banRows.slice(0, 5).forEach((b, i) => {
                    const state = b.liftedAt ? `LIFTED (${b.liftReason || 'unknown'})` : 'ACTIVE';
                    fields.push({
                        name: `Ban #${i + 1} [${b.banType.toUpperCase()}] [${state}]`,
                        value: fieldValue(
                            [
                                `ID: \`${b.id}\``,
                                `Reason: ${b.reason}`,
                                `Private Note: ${b.privateNotes ?? 'None'}`,
                                `Mod: ${b.moderator ? formatSnapshotLabel(b.moderator) : 'Unknown'}`,
                                `Date: ${b.createdAt?.toUTCString() ?? 'Unknown'}`,
                                b.expiresAt ? `Expires: ${b.expiresAt.toUTCString()}` : null,
                                b.liftedAt ? `Lifted: ${b.liftedAt.toUTCString()}` : null,
                                b.linkedMessageUrl ? `Message: [jump](${b.linkedMessageUrl})` : null,
                            ]
                                .filter(Boolean)
                                .join('\n'),
                        ),
                    });
                });
            }

            const member = await message.guild.members.fetch(id).catch(console.error);
            const embed = createEmbed({
                title: 'Background Check',
                description: `User ID: \`${id}\`\nUsername: \`${member ? member.user.username : 'Not Found'}\`\nWarnings: ${
                    warns.length
                } · Kicks: ${kickRows.length} · Bans: ${banRows.length}`,
                fields,
            });

            await message.channel.send({ embeds: [embed] }).catch(console.error);
        } catch (err) {
            console.error(err);
            await message.channel.send({ embeds: [createErrorEmbed('Error when searching database')] }).catch(console.error);
        }
    },
};
