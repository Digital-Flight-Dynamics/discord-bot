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
import { isPermanentDuration, parseDurationToMs, parseDurationToSeconds } from './lib/moderation';
import { hasRoleAccess } from './lib/moderationAccess';
import { MAX_PRIVATE_NOTE_LENGTH, MAX_REASON_LENGTH, limitModerationText } from './lib/moderationLimits';
import { executePendingModeration } from './lib/moderationExecute';
import { modPortalUrl } from './lib/moderationFormat';
import type { ModerationPreset, PendingActionType } from './db/schema';
import { handleUpdateActionCommand } from './slashUpdateAction';
import { moderationSlashCommands } from './moderationCommandDefinitions';
import { formatDeleteMessageWindow, MAX_DISCORD_TIMEOUT_MS, MAX_PURGE_SECONDS } from './lib/moderationDuration';

const FLOW_TIMEOUT_MS = 5 * 60 * 1000;
const FLOW_TIMEOUT_LABEL = '5 minutes';
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_TOKEN = '1h';

const MODERATION_ACTIONS = ['warn', 'kick', 'ban', 'soft-ban', 'timeout'] as const;
type SlashAction = (typeof MODERATION_ACTIONS)[number];

type ActionDetails = {
    reason: string;
    privateNote: string | null;
    durationToken: string | null;
    durationMs: number;
    expirationToken: string | null;
    deleteMessageSeconds?: number | null;
    deleteToken?: string | null;
};

export async function registerModerationSlashCommands(client: Client, guildId?: string): Promise<void> {
    if (!client.application) return;
    try {
        if (guildId) {
            const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
            if (!guild) {
                console.error(`[ERROR] Refusing global command registration: configured guild ${guildId} is unavailable`);
                return;
            }
            await guild.commands.set(moderationSlashCommands);
            console.log(`Registered moderation slash commands in guild ${guild.id}`);
            return;
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

    const actingMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!hasRoleAccess(actingMember, 'moderation')) {
        await interaction.respond([]).catch(console.error);
        return true;
    }

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
    const actingMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!hasRoleAccess(actingMember, 'moderation')) {
        await interaction.reply({ embeds: [errorEmbed('You do not have a configured moderation role.')], ephemeral: true });
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
        ? detailsFromPreset(
              selectedPreset,
              interaction.options.getString('private-note'),
              interaction.options.getString('expiration'),
              action,
          )
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

    const durationError = validateDuration(action, details.durationMs, details.durationToken);
    if (durationError) {
        await editOrReply(interaction, errorEmbed(durationError));
        return true;
    }
    const expirationError = validateExpiration(details.expirationToken);
    if (expirationError) {
        await editOrReply(interaction, errorEmbed(expirationError));
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
    const actingMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!hasRoleAccess(actingMember, 'moderation')) {
        await interaction.reply({ embeds: [errorEmbed('You do not have a configured moderation role.')], ephemeral: true });
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
    const durationToken = action === 'ban' || action === 'timeout' ? interaction.options.getString('duration') : null;
    const expirationToken = interaction.options.getString('expiration');
    const deleteToken = interaction.options.getString('purge-duration');
    const resolvedDurationToken = action === 'timeout' ? durationToken || DEFAULT_TIMEOUT_TOKEN : durationToken;
    let deleteMessageSeconds: number | null = null;
    let resolvedDeleteToken: string | null = null;
    if (action === 'soft-ban') {
        deleteMessageSeconds = deleteToken ? parseDurationToSeconds(deleteToken) : 86_400;
        resolvedDeleteToken = deleteToken || '1d';
    } else if (action === 'ban' && deleteToken) {
        deleteMessageSeconds = parseDurationToSeconds(deleteToken);
        resolvedDeleteToken = deleteToken;
    }
    return {
        reason: limitModerationText(interaction.options.getString('reason') || 'None', MAX_REASON_LENGTH),
        privateNote: interaction.options.getString('private-note')
            ? limitModerationText(interaction.options.getString('private-note')!, MAX_PRIVATE_NOTE_LENGTH)
            : null,
        durationToken: resolvedDurationToken,
        durationMs: resolvedDurationToken && !isPermanentDuration(resolvedDurationToken) ? parseDurationToMs(resolvedDurationToken) : 0,
        expirationToken,
        deleteMessageSeconds,
        deleteToken: resolvedDeleteToken,
    };
}

function detailsFromPreset(
    preset: ModerationPreset,
    privateNote: string | null,
    expirationToken: string | null,
    action: SlashAction,
): ActionDetails {
    const usesDuration = action === 'ban' || action === 'timeout';
    const durationToken = action === 'timeout' ? preset.durationToken || DEFAULT_TIMEOUT_TOKEN : preset.durationToken;
    const durationMs = action === 'timeout' ? preset.durationMs || DEFAULT_TIMEOUT_MS : preset.durationMs || 0;
    const usesMessageDelete = action === 'ban' || action === 'soft-ban';
    let deleteMessageSeconds = usesMessageDelete ? preset.deleteMessageSeconds : null;
    let deleteToken = deleteMessageSeconds ? `${deleteMessageSeconds}s` : null;
    if (action === 'soft-ban') {
        deleteMessageSeconds ||= 86_400;
        deleteToken ||= '1d';
    }
    return {
        reason: preset.reason,
        privateNote,
        durationToken: usesDuration ? durationToken : null,
        durationMs: usesDuration ? durationMs : 0,
        expirationToken,
        deleteMessageSeconds,
        deleteToken,
    };
}

function needsMoreDetails(action: SlashAction, details: ActionDetails): boolean {
    if (action === 'warn' && details.reason === 'None') return true;
    return action === 'ban' && !details.durationToken;
}

function validateDuration(action: SlashAction, durationMs: number, durationToken: string | null): string | null {
    if (action === 'ban' && durationToken && durationMs === 0 && !isPermanentDuration(durationToken))
        return 'Please enter a valid duration or a permanent duration such as `perm`.';
    if (action === 'timeout' && durationMs === 0) return 'Please enter a valid duration.';
    return null;
}

function validateExpiration(expirationToken: string | null): string | null {
    if (!expirationToken || /^(clear|none|never|no expiration)$/i.test(expirationToken.trim())) return null;
    return parseDurationToMs(expirationToken) > 0 ? null : 'Please enter a valid expiration.';
}

function validatePurgeDuration(seconds?: number | null): string | null {
    if (!seconds) return null;
    if (seconds > MAX_PURGE_SECONDS) return 'Purge duration cannot exceed 7 days.';
    return null;
}

function presetEmbedFields(preset: ModerationPreset) {
    return [
        { name: 'Reason', value: preset.reason.slice(0, 1024), inline: false },
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
        const expirationToken = submitted.fields.getTextInputValue('expiration')?.trim() || initial?.expirationToken || null;
        const deleteToken = action === 'ban' || action === 'soft-ban'
            ? submitted.fields.getTextInputValue('delete_messages')?.trim() || initial?.deleteToken || null
            : null;
        let deleteMessageSeconds: number | null = null;
        if (deleteToken) deleteMessageSeconds = parseDurationToSeconds(deleteToken);
        else if (action === 'soft-ban') deleteMessageSeconds = 86_400;
        const details: ActionDetails = {
            reason,
            privateNote,
            durationToken,
            durationMs: durationToken ? parseDurationToMs(durationToken) : 0,
            expirationToken,
            deleteMessageSeconds,
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
        .setMaxLength(MAX_REASON_LENGTH)
        .setStyle(TextInputStyle.Paragraph);
    if (initial?.reason && initial.reason !== 'None') reason.setValue(initial.reason);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));

    if (modalHasDuration(action)) {
        const duration = new TextInputBuilder()
            .setCustomId('duration')
            .setLabel(`${action} duration`)
            .setRequired(action === 'ban' || action === 'timeout')
            .setPlaceholder('Required, e.g. 7d, 7 days')
            .setMaxLength(40)
            .setStyle(TextInputStyle.Short);
        if (initial?.durationToken) duration.setValue(initial.durationToken);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(duration));
    }

    const expiration = new TextInputBuilder()
        .setCustomId('expiration')
        .setLabel('Profile expiration')
        .setRequired(false)
        .setPlaceholder('Optional, e.g. 30d or next Friday')
        .setMaxLength(40)
        .setStyle(TextInputStyle.Short);
    if (initial?.expirationToken) expiration.setValue(initial.expirationToken);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(expiration));

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
    return action === 'ban' || action === 'timeout';
}

async function runSlashAction(
    interaction: ChatInputCommandInteraction,
    action: SlashAction,
    target: User,
    details: ActionDetails,
): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;
    const effectiveDurationMs = action === 'timeout' ? Math.min(details.durationMs, MAX_DISCORD_TIMEOUT_MS) : details.durationMs;
    const expiresAt = effectiveDurationMs > 0 ? new Date(Date.now() + effectiveDurationMs) : null;
    const expirationMs = details.expirationToken ? parseDurationToMs(details.expirationToken) : 0;
    const recordExpiresAt = expirationMs > 0 ? new Date(Date.now() + expirationMs) : null;
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
        durationMs: effectiveDurationMs || null,
        durationToken: details.durationToken,
        expiresAt,
        recordExpiresAt,
        deleteMessageSeconds: details.deleteMessageSeconds || null,
        banType: banTypeForAction(action),
    });

    const fresh = (await getPendingModerationById(pending.id)) || pending;
    const result = await executePendingModeration(interaction.client, fresh, {
        privateNote: details.privateNote,
    });
    if (result.status === 'not-executed') {
        await interaction.editReply({ embeds: [errorEmbed(result.reason)], components: [] }).catch(console.error);
        return;
    }
    const links = [
        result.modLogUrl ? `[View mod log](${result.modLogUrl})` : null,
        `[View on ATC](${modPortalUrl(result.actionId)})`,
    ].filter(Boolean).join(' • ');
    const resultDescription = result.status === 'partial'
        ? `Action partially applied — ${target} requires manual reconciliation.${links ? `\n${links}` : ''}`
        : `Done — ${target} has been ${pastTense(action)}.${links ? `\n${links}` : ''}`;
    await interaction.editReply({
        embeds: [createEmbed({
            color: result.status === 'partial' ? EmbedColors.WARNING : EmbedColors.SUCCESS,
            description: [
                resultDescription,
                result.notice ?? null,
            ].filter(Boolean).join('\n\n'),
        })],
        components: [],
    }).catch(console.error);
}

function banTypeForAction(action: SlashAction): 'soft' | 'hard' | null {
    if (action === 'soft-ban') return 'soft';
    if (action === 'ban') return 'hard';
    return null;
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
