import {
    ActionRowBuilder,
    AutocompleteInteraction,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    Client,
    GuildMember,
    Message,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    User,
} from 'discord.js';
import { createEmbed, EmbedColors } from './lib/embed';
import { createPendingModeration, getPendingModerationById } from './db/repositories/pendingModeration';
import {
    createModerationPreset,
    deleteModerationPreset,
    listAllModerationPresets,
    updateModerationPreset,
} from './db/repositories/moderationPresets';
import { parseDurationToMs, parseDurationToSeconds } from './lib/moderation';
import { executePendingModeration } from './lib/moderationExecute';
import { modPortalUrl } from './lib/moderationFormat';
import type { ModerationPreset, PendingActionType } from './db/schema';
import { handleUpdateActionCommand, updateActionSlashCommand } from './slashUpdateAction';

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const FLOW_TIMEOUT_LABEL = '5 minutes';
const MAX_DELETE_MESSAGE_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_TOKEN = '1h';

const MODERATION_ACTIONS = ['warn', 'kick', 'ban', 'soft-ban', 'timeout'] as const;
type SlashAction = (typeof MODERATION_ACTIONS)[number];

type ActionDetails = {
    reason: string;
    privateNote: string | null;
    durationToken: string | null;
    durationMs: number;
    deleteMessageSeconds?: number | null;
    deleteToken?: string | null;
};

const durationExample = 'e.g. 7d, 7 days, next Friday';

export const moderationSlashCommands = [
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a server member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((o) => o.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning'))
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('expiration').setDescription(`Optional expiration, ${durationExample}`))
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note')),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a server member')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the kick'))
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note')),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Hard ban: standard ban, lifted manually or when duration expires')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption((o) => o.setName('user').setDescription('User to hard-ban').setRequired(true))
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('duration').setDescription(`Ban duration, ${durationExample}`))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the hard ban'))
        .addStringOption((o) =>
            o.setName('purge-duration').setDescription('Message purge duration, e.g. 10s, 1h, 1 day'),
        )
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note')),
    new SlashCommandBuilder()
        .setName('soft-ban')
        .setDescription('Ban then immediately unban to remove a user and their messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption((o) => o.setName('user').setDescription('User to soft-ban').setRequired(true))
        .addStringOption((o) =>
            o.setName('purge-duration').setDescription('Message purge duration, defaults to 1 day'),
        )
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the soft ban'))
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note')),
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout / mute a server member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption((o) => o.setName('user').setDescription('User to timeout').setRequired(true))
        .addStringOption((o) =>
            o.setName('preset').setDescription('Preset punishment to apply').setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('duration').setDescription(`Timeout duration, ${durationExample}`))
        .addStringOption((o) => o.setName('reason').setDescription('Reason for the timeout'))
        .addStringOption((o) => o.setName('private-note').setDescription('Optional staff-only note')),
    new SlashCommandBuilder()
        .setName('moderation-presets')
        .setDescription('Manage moderation punishment presets')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addSubcommand((sub) => sub.setName('list').setDescription('List all moderation presets'))
        .addSubcommand((sub) =>
            sub
                .setName('create')
                .setDescription('Create a moderation preset')
                .addStringOption((o) => o.setName('name').setDescription('Preset name').setRequired(true))
                .addStringOption((o) => o.setName('reason').setDescription('Reason text').setRequired(true))
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
                .addStringOption((o) => o.setName('reason').setDescription('New reason text'))
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

export async function registerModerationSlashCommands(client: Client, guildId?: string): Promise<void> {
    if (!client.application) return;
    try {
        if (guildId) {
            const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
            if (guild) {
                await guild.commands.set(moderationSlashCommands);
                console.log(`Registered moderation slash commands in guild ${guild.id}`);
                return;
            }
        }
        await client.application.commands.set(moderationSlashCommands);
        console.log('Registered moderation slash commands globally');
    } catch (err) {
        console.error('[ERROR] Failed to register moderation slash commands:', err);
    }
}

export async function handleModerationAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
    if (!interaction.guild) {
        await interaction.respond([]).catch(console.error);
        return true;
    }

    const isPresetAutocomplete =
        interaction.commandName === 'moderation-presets' || isModerationAction(interaction.commandName);
    if (!isPresetAutocomplete) return false;

    const focused = interaction.options.getFocused().toLowerCase();
    const presets = await listAllModerationPresets(interaction.guild.id).catch((err) => {
        console.error(err);
        return [];
    });
    await interaction
        .respond(
            presets
                .filter((preset) => preset.name.toLowerCase().includes(focused))
                .slice(0, 25)
                .map((preset) => ({
                    name: preset.name.slice(0, 100),
                    value: preset.id,
                })),
        )
        .catch(console.error);
    return true;
}

export async function handleModerationSlashCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (await handleUpdateActionCommand(interaction)) return true;

    if (interaction.commandName === 'moderation-presets') {
        await handleModerationPresetsCommand(interaction);
        return true;
    }

    if (!isModerationAction(interaction.commandName)) return false;
    const action = interaction.commandName;
    if (!interaction.guild) {
        await interaction.reply({ embeds: [errorEmbed('Moderation commands can only be used in a server.')], ephemeral: true });
        return true;
    }

    const target = interaction.options.getUser('user', true);
    const selectedPreset = await getSelectedPreset(interaction);
    if (selectedPreset === undefined) {
        await interaction.reply({ embeds: [errorEmbed('Selected preset could not be found.')], ephemeral: true });
        return true;
    }
    if (action === 'warn' && !selectedPreset && !interaction.options.getString('reason')?.trim()) {
        await interaction.reply({
            embeds: [
                errorEmbed('No reason was provided nor a preset was selected. Either one must be provided.'),
            ],
            ephemeral: true,
        });
        return true;
    }

    let details = selectedPreset
        ? detailsFromPreset(selectedPreset, interaction.options.getString('private-note'), action)
        : detailsFromOptions(interaction, action);

    if (!selectedPreset && needsMoreDetails(action, details)) {
        const custom = await promptDetailsModal(interaction, action, details);
        if (!custom) return true;
        details = custom;
    } else {
        await interaction.reply({ embeds: [workingEmbed()], ephemeral: true });
    }

    const validation = await validateTarget(interaction, action, target);
    if (validation.ok === false) {
        await editOrReply(interaction, errorEmbed(validation.message));
        return true;
    }

    const durationError = validateDuration(action, details.durationMs);
    if (durationError) {
        await editOrReply(interaction, errorEmbed(durationError));
        return true;
    }
    if ((action === 'ban' || action === 'soft-ban') && details.deleteToken && !details.deleteMessageSeconds) {
        await editOrReply(interaction, errorEmbed('Please enter a valid purge duration.'));
        return true;
    }
    const purgeDurationError = validatePurgeDuration(details.deleteMessageSeconds);
    if (purgeDurationError) {
        await editOrReply(interaction, errorEmbed(purgeDurationError));
        return true;
    }

    await runSlashAction(interaction, action, target, details);
    return true;
}

async function handleModerationPresetsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
        await interaction.reply({ embeds: [errorEmbed('This command can only be used in a server.')], ephemeral: true });
        return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'list') {
        const presets = await listAllModerationPresets(interaction.guild.id);
        const lines = presets.length
            ? presets.map((preset) =>
                  [
                      `• **${preset.name}**`,
                      `Reason: ${preset.reason}`,
                      preset.durationToken ? `Duration: ${preset.durationToken}` : null,
                      preset.deleteMessageSeconds
                          ? `Purge duration: ${formatDeleteMessageWindow(preset.deleteMessageSeconds)}`
                          : null,
                      `ID: \`${preset.id}\``,
                  ]
                      .filter(Boolean)
                      .join(' — '),
              )
            : ['No presets found.'];
        await interaction.reply({
            embeds: [
                createEmbed({
                    color: EmbedColors.DFD_BLUE,
                    title: 'Moderation presets',
                    description: lines.join('\n').slice(0, 4000),
                }),
            ],
            ephemeral: true,
        });
        return;
    }

    if (subcommand === 'edit') {
        const presetId = interaction.options.getString('preset', true);
        const existing = (await listAllModerationPresets(interaction.guild.id)).find((preset) => preset.id === presetId);
        if (!existing) {
            await interaction.reply({ embeds: [errorEmbed('Preset not found.')], ephemeral: true });
            return;
        }

        const name = interaction.options.getString('name')?.trim() || null;
        const reason = interaction.options.getString('reason')?.trim() || null;
        const durationToken = interaction.options.getString('duration')?.trim() || null;
        const durationMs = durationToken ? parseDurationToMs(durationToken) : undefined;
        const deleteToken = interaction.options.getString('purge-duration')?.trim() || null;
        const deleteMessageSeconds = deleteToken ? parseDurationToSeconds(deleteToken) : undefined;

        if (durationToken && durationMs === 0) {
            await interaction.reply({ embeds: [errorEmbed('Please enter a valid duration.')], ephemeral: true });
            return;
        }
        if (deleteToken && !deleteMessageSeconds) {
            await interaction.reply({ embeds: [errorEmbed('Please enter a valid purge duration.')], ephemeral: true });
            return;
        }
        const deleteWindowError = validatePurgeDuration(deleteMessageSeconds);
        if (deleteWindowError) {
            await interaction.reply({ embeds: [errorEmbed(deleteWindowError)], ephemeral: true });
            return;
        }
        if (!name && !reason && !durationToken && !deleteToken) {
            await interaction.reply({ embeds: [errorEmbed('Provide at least one field to edit.')], ephemeral: true });
            return;
        }

        const updated = await updateModerationPreset(interaction.guild.id, presetId, {
            ...(name ? { name } : {}),
            ...(reason ? { reason } : {}),
            ...(durationToken ? { durationToken, durationMs } : {}),
            ...(deleteToken ? { deleteMessageSeconds } : {}),
        });

        await interaction.reply({
            embeds: [
                updated
                    ? createEmbed({
                          color: EmbedColors.SUCCESS,
                          title: 'Preset updated',
                          description: `Updated **${updated.name}**.`,
                          fields: presetEmbedFields(updated),
                      })
                    : errorEmbed('Preset not found.'),
            ],
            ephemeral: true,
        });
        return;
    }

    if (subcommand === 'delete') {
        const presetId = interaction.options.getString('preset', true);
        const deleted = await deleteModerationPreset(interaction.guild.id, presetId);
        await interaction.reply({
            embeds: [
                deleted
                    ? createEmbed({ color: EmbedColors.SUCCESS, description: `Deleted preset **${deleted.name}**.` })
                    : errorEmbed('Preset not found.'),
            ],
            ephemeral: true,
        });
        return;
    }

    const name = interaction.options.getString('name', true).trim();
    const reason = interaction.options.getString('reason', true).trim();
    const durationToken = interaction.options.getString('duration')?.trim() || null;
    const durationMs = durationToken ? parseDurationToMs(durationToken) : 0;
    const deleteToken = interaction.options.getString('purge-duration')?.trim() || null;
    const deleteMessageSeconds = deleteToken ? parseDurationToSeconds(deleteToken) : null;

    if (durationToken && durationMs === 0) {
        await interaction.reply({ embeds: [errorEmbed('Please enter a valid duration.')], ephemeral: true });
        return;
    }
    if (deleteToken && !deleteMessageSeconds) {
        await interaction.reply({ embeds: [errorEmbed('Please enter a valid purge duration.')], ephemeral: true });
        return;
    }
    const deleteWindowError = validatePurgeDuration(deleteMessageSeconds);
    if (deleteWindowError) {
        await interaction.reply({ embeds: [errorEmbed(deleteWindowError)], ephemeral: true });
        return;
    }

    const preset = await createModerationPreset({
        guildId: interaction.guild.id,
        name,
        reason,
        durationMs: durationMs || null,
        durationToken,
        deleteMessageSeconds,
    });
    await interaction.reply({
        embeds: [
            createEmbed({
                color: EmbedColors.SUCCESS,
                title: 'Preset created',
                description: `Created **${preset.name}**.`,
                fields: presetEmbedFields(preset),
            }),
        ],
        ephemeral: true,
    });
}

async function getSelectedPreset(
    interaction: ChatInputCommandInteraction,
): Promise<ModerationPreset | null | undefined> {
    const presetId = interaction.options.getString('preset');
    if (!presetId) return null;
    const guild = interaction.guild;
    if (!guild) return undefined;
    const presets = await listAllModerationPresets(guild.id).catch((err) => {
        console.error(err);
        return [];
    });
    return presets.find((preset) => preset.id === presetId) || undefined;
}

async function validateTarget(
    interaction: ChatInputCommandInteraction,
    action: SlashAction,
    target: User,
): Promise<{ ok: true; member: GuildMember | null } | { ok: false; message: string }> {
    const guild = interaction.guild;
    if (!guild) return { ok: false, message: 'Moderation commands can only be used in a server.' };
    const member = await guild.members.fetch(target.id).catch(() => null);
    if (action !== 'warn' && target.id === interaction.user.id) {
        return { ok: false, message: `You cannot ${action === 'timeout' ? 'timeout' : action} yourself` };
    }
    if (action === 'warn' && target.id !== interaction.user.id && member && !member.kickable) {
        return { ok: false, message: 'I cannot warn this user' };
    }
    if (action === 'kick' && (!member || !member.kickable)) return { ok: false, message: 'I cannot kick this user' };
    if (action === 'timeout' && (!member || !member.manageable)) return { ok: false, message: 'I cannot timeout this user' };
    if ((action === 'ban' || action === 'soft-ban') && member && !member.bannable) {
        return { ok: false, message: 'I cannot ban this user' };
    }
    return { ok: true, member };
}

function detailsFromOptions(interaction: ChatInputCommandInteraction, action: SlashAction): ActionDetails {
    const durationToken = interaction.options.getString(action === 'warn' ? 'expiration' : 'duration');
    const deleteToken = interaction.options.getString('purge-duration');
    const resolvedDurationToken = action === 'timeout' ? durationToken || DEFAULT_TIMEOUT_TOKEN : durationToken;
    return {
        reason: interaction.options.getString('reason') || 'None',
        privateNote: interaction.options.getString('private-note'),
        durationToken: resolvedDurationToken,
        durationMs: resolvedDurationToken ? parseDurationToMs(resolvedDurationToken) : 0,
        deleteMessageSeconds: action === 'soft-ban'
            ? deleteToken ? parseDurationToSeconds(deleteToken) : 86400
            : action === 'ban' && deleteToken ? parseDurationToSeconds(deleteToken) : null,
        deleteToken: action === 'soft-ban' ? deleteToken || '1d' : action === 'ban' ? deleteToken : null,
    };
}

function detailsFromPreset(preset: ModerationPreset, privateNote: string | null, action: SlashAction): ActionDetails {
    const usesDuration = action === 'ban' || action === 'timeout';
    const durationToken = action === 'timeout' ? preset.durationToken || DEFAULT_TIMEOUT_TOKEN : preset.durationToken;
    const durationMs = action === 'timeout' ? preset.durationMs || DEFAULT_TIMEOUT_MS : preset.durationMs || 0;
    const usesMessageDelete = action === 'ban' || action === 'soft-ban';
    return {
        reason: preset.reason,
        privateNote,
        durationToken: usesDuration ? durationToken : null,
        durationMs: usesDuration ? durationMs : 0,
        deleteMessageSeconds: action === 'soft-ban'
            ? preset.deleteMessageSeconds || 86400
            : usesMessageDelete ? preset.deleteMessageSeconds : null,
        deleteToken: action === 'soft-ban'
            ? preset.deleteMessageSeconds ? `${preset.deleteMessageSeconds}s` : '1d'
            : usesMessageDelete && preset.deleteMessageSeconds ? `${preset.deleteMessageSeconds}s` : null,
    };
}

function needsMoreDetails(action: SlashAction, details: ActionDetails): boolean {
    if (action === 'warn' && details.reason === 'None') return true;
    return action === 'ban' && details.durationMs === 0;
}

function validateDuration(action: SlashAction, durationMs: number): string | null {
    if (action === 'ban' && durationMs === 0) return 'Please enter a valid duration.';
    if (action === 'timeout' && durationMs === 0) return 'Please enter a valid duration.';
    return null;
}

function validatePurgeDuration(seconds?: number | null): string | null {
    if (!seconds) return null;
    if (seconds > MAX_DELETE_MESSAGE_SECONDS) return 'Purge duration cannot exceed 7 days.';
    return null;
}

function formatDeleteMessageWindow(seconds: number): string {
    if (seconds % 86400 === 0) return `${seconds / 86400}d`;
    if (seconds % 3600 === 0) return `${seconds / 3600}h`;
    if (seconds % 60 === 0) return `${seconds / 60}m`;
    return `${seconds}s`;
}

function presetEmbedFields(preset: ModerationPreset) {
    return [
        { name: 'Reason', value: preset.reason, inline: false },
        { name: 'Duration', value: preset.durationToken || 'None', inline: true },
        {
            name: 'Purge duration',
            value: preset.deleteMessageSeconds ? formatDeleteMessageWindow(preset.deleteMessageSeconds) : 'None',
            inline: true,
        },
        { name: 'ID', value: `\`${preset.id}\``, inline: false },
    ];
}

async function promptDetailsModal(
    interaction: ChatInputCommandInteraction,
    action: SlashAction,
    initial?: ActionDetails,
): Promise<ActionDetails | null> {
    const buttonId = `slash_details_button_${interaction.id}`;
    const modalId = `slash_details_modal_${interaction.id}`;
    let buttonInteraction: ButtonInteraction | ChatInputCommandInteraction = interaction;

    if (!interaction.replied) {
        const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(buttonId).setLabel('Add details').setStyle(ButtonStyle.Primary),
        );
        const reply = (await interaction.reply({
            embeds: [
                createEmbed({
                    color: EmbedColors.WARNING,
                    description:
                        'Missing required details. Tap the button below to include them.\n' +
                        `-# This is only visible to you. Expires in ${FLOW_TIMEOUT_LABEL}.`,
                }),
            ],
            components: [button],
            ephemeral: true,
            fetchReply: true,
        })) as Message;
        try {
            const component = await reply.awaitMessageComponent({
                filter: (i) => i.user.id === interaction.user.id && i.customId === buttonId,
                time: FLOW_TIMEOUT_MS,
            });
            if (!component.isButton()) return null;
            buttonInteraction = component;
        } catch {
            await interaction.editReply({ components: [] }).catch(console.error);
            return null;
        }
    }

    const modal = buildDetailsModal(modalId, action, initial);
    await buttonInteraction.showModal(modal);
    try {
        const submitted = await buttonInteraction.awaitModalSubmit({
            filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
            time: FLOW_TIMEOUT_MS,
        });
        const reason = submitted.fields.getTextInputValue('reason').trim() || 'None';
        const privateNote = submitted.fields.getTextInputValue('private_note')?.trim() || initial?.privateNote || null;
        const durationToken = modalHasDuration(action)
            ? submitted.fields.getTextInputValue('duration')?.trim() || null
            : null;
        const deleteToken = action === 'ban' || action === 'soft-ban'
            ? submitted.fields.getTextInputValue('delete_messages')?.trim() || initial?.deleteToken || null
            : null;
        const details: ActionDetails = {
            reason,
            privateNote,
            durationToken,
            durationMs: durationToken ? parseDurationToMs(durationToken) : 0,
            deleteMessageSeconds: action === 'soft-ban'
                ? deleteToken ? parseDurationToSeconds(deleteToken) : 86400
                : deleteToken ? parseDurationToSeconds(deleteToken) : null,
            deleteToken: action === 'soft-ban' ? deleteToken || '1d' : deleteToken,
        };
        await submitted.deferUpdate().catch(console.error);
        await interaction.editReply({ embeds: [workingEmbed()], components: [] }).catch(console.error);
        return details;
    } catch {
        await interaction.editReply({ components: [] }).catch(console.error);
        return null;
    }
}

function buildDetailsModal(modalId: string, action: SlashAction, initial?: ActionDetails): ModalBuilder {
    const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Add ${action} details`);
    const reason = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setRequired(action === 'warn')
        .setMaxLength(1000)
        .setStyle(TextInputStyle.Paragraph);
    if (initial?.reason && initial.reason !== 'None') reason.setValue(initial.reason);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));

    if (modalHasDuration(action)) {
        const duration = new TextInputBuilder()
            .setCustomId('duration')
            .setLabel(action === 'warn' ? 'Expiration' : `${action} duration`)
            .setRequired(action === 'ban' || action === 'timeout')
            .setPlaceholder(action === 'warn' ? 'Optional, e.g. 7d, 7 days' : 'Required, e.g. 7d, 7 days')
            .setMaxLength(40)
            .setStyle(TextInputStyle.Short);
        if (initial?.durationToken) duration.setValue(initial.durationToken);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(duration));
    }

    if (action === 'ban' || action === 'soft-ban') {
        const deleteMessages = new TextInputBuilder()
            .setCustomId('delete_messages')
            .setLabel('Purge duration')
            .setRequired(false)
            .setPlaceholder(action === 'soft-ban' ? 'Optional, defaults to 1 day' : 'Optional, e.g. 10s, 1h, 1 day')
            .setMaxLength(40)
            .setStyle(TextInputStyle.Short);
        if (initial?.deleteToken) deleteMessages.setValue(initial.deleteToken);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(deleteMessages));
    }

    const privateNote = new TextInputBuilder()
        .setCustomId('private_note')
        .setLabel('Private note')
        .setRequired(false)
        .setMaxLength(500)
        .setStyle(TextInputStyle.Paragraph);
    if (initial?.privateNote) privateNote.setValue(initial.privateNote);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(privateNote));
    return modal;
}

function modalHasDuration(action: SlashAction): boolean {
    return action === 'warn' || action === 'ban' || action === 'timeout';
}

async function runSlashAction(
    interaction: ChatInputCommandInteraction,
    action: SlashAction,
    target: User,
    details: ActionDetails,
): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;
    const expiresAt = details.durationMs > 0 ? new Date(Date.now() + details.durationMs) : null;
    await interaction.editReply({
        embeds: [workingEmbed()],
        components: [],
    }).catch(console.error);

    const pending = await createPendingModeration({
        guildId: guild.id,
        actionType: pendingActionFor(action),
        subjectUserId: target.id,
        moderatorUserId: interaction.user.id,
        reason: details.reason,
        durationMs: details.durationMs || null,
        durationToken: details.durationToken,
        expiresAt,
        deleteMessageSeconds: details.deleteMessageSeconds || null,
        banType: action === 'soft-ban' ? 'soft' : action === 'ban' ? 'hard' : null,
        commandChannelId: interaction.channelId,
    });

    const fresh = (await getPendingModerationById(pending.id)) || pending;
    const result = await executePendingModeration(interaction.client, fresh, {
        privateNote: details.privateNote,
    });
    const links = result
        ? [
              result.modLogUrl ? `[View mod log](${result.modLogUrl})` : null,
              `[View on ATC](${modPortalUrl(result.actionId)})`,
          ]
              .filter(Boolean)
              .join(' • ')
        : null;
    await interaction.editReply({
        embeds: [
            createEmbed({
                color: EmbedColors.SUCCESS,
                description: [
                    `Done — ${target} has been ${pastTense(action)}.${links ? `\n${links}` : ''}`,
                    result?.notice ?? null,
                ]
                    .filter(Boolean)
                    .join('\n\n'),
            }),
        ],
        components: [],
    }).catch(console.error);
}

function isModerationAction(name: string): name is SlashAction {
    return MODERATION_ACTIONS.includes(name as SlashAction);
}

function pendingActionFor(action: SlashAction): PendingActionType {
    return action === 'soft-ban' ? 'ban' : action;
}

function pastTense(action: SlashAction): string {
    if (action === 'warn') return 'warned';
    if (action === 'kick') return 'kicked';
    if (action === 'timeout') return 'muted';
    if (action === 'soft-ban') return 'soft-banned';
    return 'banned';
}

function workingEmbed() {
    return createEmbed({ color: 0xf97316, description: '*Working on it...*' });
}

function errorEmbed(description: string) {
    return createEmbed({ color: EmbedColors.FAILURE, title: 'Error', description });
}

async function editOrReply(interaction: ChatInputCommandInteraction, embed: ReturnType<typeof createEmbed>) {
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [] }).catch(console.error);
    } else {
        await interaction.reply({ embeds: [embed], ephemeral: true }).catch(console.error);
    }
}
