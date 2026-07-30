import { SlashCommandBuilder } from 'discord.js';
import { MAX_PRIVATE_NOTE_LENGTH, MAX_REASON_LENGTH } from './lib/moderationLimits';

export const updateActionSlashCommand = new SlashCommandBuilder()
    .setName('update-action')
    .setDescription('Update an existing moderation action and write an audit trail')
    .addSubcommand((sub) =>
        sub
            .setName('change-reason')
            .setDescription('Update the public/staff reason on an action')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) => o.setName('new-reason').setDescription('New reason').setRequired(true).setMaxLength(MAX_REASON_LENGTH))
            .addStringOption((o) => o
                    .setName('rationale')
                    .setDescription('Why this edit is being made')
                    .setRequired(true)
                    .setMaxLength(MAX_REASON_LENGTH))
            .addStringOption((o) =>
                o
                    .setName('notification-mode')
                    .setDescription('No DM, silently edit original DM, or send an update DM')
                    .setRequired(true)
                    .addChoices(
                        { name: 'No', value: 'no' },
                        { name: 'Silent Edit (Warning: edited tag visible; not online)', value: 'silent-edit' },
                        { name: 'Notify', value: 'notify' },
                    ),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName('change-note')
            .setDescription('Update the private staff note on an action')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) => o.setName('new-note').setDescription('New private note').setRequired(true).setMaxLength(MAX_PRIVATE_NOTE_LENGTH))
            .addStringOption((o) => o
                    .setName('rationale')
                    .setDescription('Why this edit is being made')
                    .setRequired(true)
                    .setMaxLength(MAX_REASON_LENGTH))
            .addStringOption((o) =>
                o
                    .setName('notification-mode')
                    .setDescription('No DM, silently edit original DM, or send an update DM')
                    .setRequired(true)
                    .addChoices(
                        { name: 'No', value: 'no' },
                        { name: 'Silent Edit (Warning: edited tag visible; not online)', value: 'silent-edit' },
                        { name: 'Notify', value: 'notify' },
                    ),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName('change-duration')
            .setDescription('Update timeout/ban duration from now')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) => o.setName('new-duration').setDescription('New duration, e.g. 7d or 7 days').setRequired(true))
            .addStringOption((o) => o
                    .setName('rationale')
                    .setDescription('Why this edit is being made')
                    .setRequired(true)
                    .setMaxLength(MAX_REASON_LENGTH))
            .addStringOption((o) =>
                o
                    .setName('notification-mode')
                    .setDescription('No DM, silently edit original DM, or send an update DM')
                    .setRequired(true)
                    .addChoices(
                        { name: 'No', value: 'no' },
                        { name: 'Silent Edit (Warning: edited tag visible; not online)', value: 'silent-edit' },
                        { name: 'Notify', value: 'notify' },
                    ),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName('change-expiration')
            .setDescription('Update or clear warning/timeout/ban expiration')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) => o.setName('new-expiration').setDescription('New expiration, duration, or clear').setRequired(true))
            .addStringOption((o) => o
                    .setName('rationale')
                    .setDescription('Why this edit is being made')
                    .setRequired(true)
                    .setMaxLength(MAX_REASON_LENGTH))
            .addStringOption((o) =>
                o
                    .setName('notification-mode')
                    .setDescription('No DM, silently edit original DM, or send an update DM')
                    .setRequired(true)
                    .addChoices(
                        { name: 'No', value: 'no' },
                        { name: 'Silent Edit (Warning: edited tag visible; not online)', value: 'silent-edit' },
                        { name: 'Notify', value: 'notify' },
                    ),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName('change-purge-duration')
            .setDescription('Update recorded ban/soft-ban message purge duration')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) => o.setName('new-purge-duration').setDescription('New purge duration, e.g. 1d').setRequired(true))
            .addStringOption((o) => o
                    .setName('rationale')
                    .setDescription('Why this edit is being made')
                    .setRequired(true)
                    .setMaxLength(MAX_REASON_LENGTH))
            .addStringOption((o) =>
                o
                    .setName('notification-mode')
                    .setDescription('No DM, silently edit original DM, or send an update DM')
                    .setRequired(true)
                    .addChoices(
                        { name: 'No', value: 'no' },
                        { name: 'Silent Edit (Warning: edited tag visible; not online)', value: 'silent-edit' },
                        { name: 'Notify', value: 'notify' },
                    ),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName('revoke')
            .setDescription('Revoke an action or record that its appeal was approved')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) =>
                o
                    .setName('outcome')
                    .setDescription('How this action was resolved')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Action Revoked', value: 'revoked' },
                        { name: 'Appeal Approved', value: 'appeal-approved' },
                    ),
            )
            .addStringOption((o) =>
                o.setName('reason').setDescription('Why this action is being resolved').setRequired(true).setMaxLength(MAX_REASON_LENGTH),
            )
            .addStringOption((o) =>
                o.setName('appeal-id').setDescription('Required when approving an appeal'),
            )
            .addStringOption((o) =>
                o.setName('public-note').setDescription('Optional note shown to the affected user').setMaxLength(MAX_PRIVATE_NOTE_LENGTH),
            ),
    )
    .addSubcommand((sub) =>
        sub
            .setName('review-appeal')
            .setDescription('Mark an appeal as under review')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) => o.setName('appeal-id').setDescription('Appeal ID').setRequired(true)),
    )
    .addSubcommand((sub) =>
        sub
            .setName('deny-appeal')
            .setDescription('Deny an appeal without resolving the action')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) => o.setName('appeal-id').setDescription('Appeal ID').setRequired(true))
            .addStringOption((o) =>
                o.setName('reason').setDescription('Internal reason for the decision').setRequired(true).setMaxLength(MAX_REASON_LENGTH),
            )
            .addStringOption((o) =>
                o.setName('public-note').setDescription('Optional note shown to the affected user').setMaxLength(MAX_PRIVATE_NOTE_LENGTH),
            ),
    )
    .toJSON();


const durationExample = 'e.g. 7d, 7 days, next Friday';

export const moderationSlashCommands = [
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a server member')
        .addUserOption((o) => o.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning').setMaxLength(MAX_REASON_LENGTH))
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('expiration').setDescription(`Optional expiration, ${durationExample}`))
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note').setMaxLength(MAX_PRIVATE_NOTE_LENGTH)),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a server member')
        .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the kick').setMaxLength(MAX_REASON_LENGTH))
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note').setMaxLength(MAX_PRIVATE_NOTE_LENGTH)),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Hard ban: standard ban, lifted manually or when duration expires')
        .addUserOption((o) => o.setName('user').setDescription('User to hard-ban').setRequired(true))
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('duration').setDescription(`Ban duration, ${durationExample}`))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the hard ban').setMaxLength(MAX_REASON_LENGTH))
        .addStringOption((o) =>
            o.setName('purge-duration').setDescription('Message purge duration, e.g. 10s, 1h, 1 day'),
        )
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note').setMaxLength(MAX_PRIVATE_NOTE_LENGTH)),
    new SlashCommandBuilder()
        .setName('soft-ban')
        .setDescription('Ban then immediately unban to remove a user and their messages')
        .addUserOption((o) => o.setName('user').setDescription('User to soft-ban').setRequired(true))
        .addStringOption((o) =>
            o.setName('purge-duration').setDescription('Message purge duration, defaults to 1 day'),
        )
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the soft ban').setMaxLength(MAX_REASON_LENGTH))
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note').setMaxLength(MAX_PRIVATE_NOTE_LENGTH)),
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout / mute a server member')
        .addUserOption((o) => o.setName('user').setDescription('User to timeout').setRequired(true))
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('duration').setDescription(`Timeout duration, ${durationExample}`))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the timeout').setMaxLength(MAX_REASON_LENGTH))
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note').setMaxLength(MAX_PRIVATE_NOTE_LENGTH)),
    new SlashCommandBuilder()
        .setName('moderation-presets')
        .setDescription('Manage moderation punishment presets')
        .addSubcommand((sub) => sub.setName('list').setDescription('List all moderation presets'))
        .addSubcommand((sub) =>
            sub
                .setName('create')
                .setDescription('Create a moderation preset')
                .addStringOption((o) => o.setName('name').setDescription('Preset name').setRequired(true))
                .addStringOption((o) => o.setName('reason').setDescription('Reason text').setRequired(true).setMaxLength(MAX_REASON_LENGTH))
                .addStringOption((o) =>
                    o.setName('duration').setDescription(`Timeouts & bans only: duration, ${durationExample}`),
                )
                .addStringOption((o) =>
                    o.setName('purge-duration').setDescription('Bans only: message purge duration, e.g. 10s, 1h, 1 day'),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('edit')
                .setDescription('Edit a moderation preset')
                .addStringOption((o) =>
                    o.setName('preset').setDescription('Preset to edit').setRequired(true).setAutocomplete(true),
                )
                .addStringOption((o) => o.setName('name').setDescription('New preset name'))
                .addStringOption((o) => o.setName('reason').setDescription('New reason text').setMaxLength(MAX_REASON_LENGTH))
                .addStringOption((o) =>
                    o.setName('duration').setDescription(`Timeouts & bans only: duration, ${durationExample}`),
                )
                .addStringOption((o) =>
                    o.setName('purge-duration').setDescription('Bans only: message purge duration, e.g. 10s, 1h, 1 day'),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('delete')
                .setDescription('Delete a moderation preset')
                .addStringOption((o) =>
                    o.setName('preset').setDescription('Preset to delete').setRequired(true).setAutocomplete(true),
                ),
        ),
    updateActionSlashCommand,
].map((command) => 'toJSON' in command ? command.toJSON() : command);
