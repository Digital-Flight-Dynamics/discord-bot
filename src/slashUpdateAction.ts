import {
    ChatInputCommandInteraction,
    Client,
    EmbedBuilder,
    Guild,
    PermissionFlagsBits,
    SlashCommandBuilder,
    User,
} from 'discord.js';
import { and, eq } from 'drizzle-orm';
import { getDb } from './db/client';
import { findActionId } from './db/repositories/actionIds';
import {
    createModerationActionAudit,
    listModerationActionAudits,
    updateModerationActionAuditMetadata,
} from './db/repositories/moderationActionAudits';
import {
    createModerationActionNotification,
    findLatestActionNotification,
} from './db/repositories/moderationActionNotifications';
import { findModLogByCase } from './db/repositories/modLogMessages';
import { captureIdentitySnapshot } from './db/repositories/snapshots';
import { bans, identitySnapshots, kicks, timeouts, warnings, type ActionIdRow, type ModCaseType } from './db/schema';
import { createEmbed, EmbedColors } from './lib/embed';
import { tryDmUser } from './lib/moderationNotify';
import { parseDurationToMs, parseDurationToSeconds } from './lib/moderation';
import { appealUrl, modLogMessageUrl, modPortalUrl } from './lib/moderationFormat';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const MAX_PURGE_SECONDS = 7 * 24 * 60 * 60;

type UpdateChangeKind = 'reason' | 'note' | 'duration' | 'expiration' | 'purge-duration';
type NotificationMode = 'no' | 'silent-edit' | 'notify';
type NotificationResult = { status: string; detail?: string; channelId?: string; messageId?: string };

type LoadedAction = {
    actionId: ActionIdRow;
    caseType: ModCaseType;
    actionName: string;
    subjectUserId: string | null;
    record: Record<string, unknown>;
};

export const updateActionSlashCommand = new SlashCommandBuilder()
    .setName('update-action')
    .setDescription('Update an existing moderation action and write an audit trail')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
        sub
            .setName('change-reason')
            .setDescription('Update the public/staff reason on an action')
            .addStringOption((o) => o.setName('action-id').setDescription('Public action ID').setRequired(true))
            .addStringOption((o) => o.setName('new-reason').setDescription('New reason').setRequired(true))
            .addStringOption((o) => o.setName('rationale').setDescription('Why this edit is being made').setRequired(true))
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
            .addStringOption((o) => o.setName('new-note').setDescription('New private note').setRequired(true))
            .addStringOption((o) => o.setName('rationale').setDescription('Why this edit is being made').setRequired(true))
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
            .addStringOption((o) => o.setName('rationale').setDescription('Why this edit is being made').setRequired(true))
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
            .addStringOption((o) => o.setName('rationale').setDescription('Why this edit is being made').setRequired(true))
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
            .addStringOption((o) => o.setName('rationale').setDescription('Why this edit is being made').setRequired(true))
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
    .toJSON();

export async function handleUpdateActionCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (interaction.commandName !== 'update-action') return false;
    if (!interaction.guild) {
        await interaction.reply({ embeds: [errorEmbed('This command can only be used in a server.')], ephemeral: true });
        return true;
    }

    await interaction.reply({ embeds: [createEmbed({ color: 0xf97316, description: '*Working on it...*' })], ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const kind = subcommand.replace(/^change-/, '') as UpdateChangeKind;
    const actionId = normalizeActionId(interaction.options.getString('action-id', true));
    const newValue = getNewValue(interaction, kind);
    const rationale = interaction.options.getString('rationale', true).trim();
    const notificationMode = (interaction.options.getString('notification-mode') || 'no') as NotificationMode;

    try {
        const loaded = await loadAction(interaction.guild.id, actionId);
        if (!loaded) {
            await interaction.editReply({ embeds: [errorEmbed('Action ID not found.')] });
            return true;
        }

        const applied = await applyActionUpdate(interaction.guild, loaded, kind, newValue, rationale);
        const moderatorMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const moderatorSnap = await captureIdentitySnapshot({
            member: moderatorMember || undefined,
            user: interaction.user,
            discordUserId: interaction.user.id,
            enrichProfile: false,
        });
        const audit = await createModerationActionAudit({
            guildId: interaction.guild.id,
            actionId: loaded.actionId.actionId,
            recordType: loaded.actionId.recordType,
            recordUuid: loaded.actionId.recordUuid,
            changeType: applied.label,
            moderatorSnapshotId: moderatorSnap.id,
            moderatorUserId: interaction.user.id,
            oldValue: applied.oldDisplay,
            newValue: applied.newDisplay,
            rationale,
            notifyUser: notificationMode === 'notify',
            metadata: { ...applied.metadata, notificationMode },
        });

        const notificationResult = await handleUserNotification(
            interaction.client,
            interaction.guild,
            loaded,
            applied.label,
            applied.newDisplay,
            notificationMode,
            audit.id,
        );
        await updateModerationActionAuditMetadata(audit.id, {
            ...applied.metadata,
            notificationMode,
            notificationStatus: notificationResult.status,
            notificationDetail: notificationResult.detail ?? null,
            notificationChannelId: notificationResult.channelId ?? null,
            notificationMessageId: notificationResult.messageId ?? null,
        });
        await Promise.all([
            refreshModLogAudit(interaction.client, interaction.guild, loaded),
            postThreadAuditEmbed(
                interaction.client,
                interaction.guild,
                loaded,
                interaction.user,
                applied.label,
                applied.newDisplay,
                rationale,
                notificationResult,
            ),
        ]);

        const links = await updateActionLinks(interaction.guild.id, loaded);
        await interaction.editReply({
            embeds: [
                createEmbed({
                    color: EmbedColors.SUCCESS,
                    description: `Done, action has been updated\n\n${links}`,
                }),
            ],
        });
    } catch (err) {
        console.error('[ERROR] Failed to update moderation action:', err);
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        await interaction.editReply({ embeds: [errorEmbed(message)] }).catch(console.error);
    }
    return true;
}

function normalizeActionId(raw: string): string {
    return raw.trim().replace(/^`|`$/g, '').replace(/^#/, '').toUpperCase();
}

function getNewValue(interaction: ChatInputCommandInteraction, kind: UpdateChangeKind): string {
    const optionName =
        kind === 'reason'
            ? 'new-reason'
            : kind === 'note'
              ? 'new-note'
              : kind === 'duration'
                ? 'new-duration'
                : kind === 'expiration'
                  ? 'new-expiration'
                  : 'new-purge-duration';
    return interaction.options.getString(optionName, true).trim();
}

async function loadAction(guildId: string, actionId: string): Promise<LoadedAction | null> {
    const action = await findActionId(actionId);
    if (!action || action.guildId !== guildId) return null;
    const db = getDb();

    if (action.recordType === 'warning') {
        const rows = await db
            .select({ record: warnings, subject: identitySnapshots })
            .from(warnings)
            .innerJoin(identitySnapshots, eq(warnings.subjectSnapshotId, identitySnapshots.id))
            .where(and(eq(warnings.id, action.recordUuid), eq(warnings.guildId, guildId)))
            .limit(1);
        const row = rows[0];
        return row
            ? {
                  actionId: action,
                  caseType: 'warning',
                  actionName: 'warning',
                  subjectUserId: row.subject.discordUserId,
                  record: row.record,
              }
            : null;
    }

    if (action.recordType === 'kick') {
        const rows = await db
            .select({ record: kicks, subject: identitySnapshots })
            .from(kicks)
            .innerJoin(identitySnapshots, eq(kicks.subjectSnapshotId, identitySnapshots.id))
            .where(and(eq(kicks.id, action.recordUuid), eq(kicks.guildId, guildId)))
            .limit(1);
        const row = rows[0];
        return row ? { actionId: action, caseType: 'kick', actionName: 'kick', subjectUserId: row.subject.discordUserId, record: row.record } : null;
    }

    if (action.recordType === 'ban' || action.recordType === 'softban') {
        const rows = await db
            .select({ record: bans, subject: identitySnapshots })
            .from(bans)
            .innerJoin(identitySnapshots, eq(bans.subjectSnapshotId, identitySnapshots.id))
            .where(and(eq(bans.id, action.recordUuid), eq(bans.guildId, guildId)))
            .limit(1);
        const row = rows[0];
        const actionName = row?.record.banType === 'soft' ? 'soft-ban' : 'ban';
        return row ? { actionId: action, caseType: 'ban', actionName, subjectUserId: row.subject.discordUserId, record: row.record } : null;
    }

    if (action.recordType === 'timeout') {
        const rows = await db
            .select({ record: timeouts, subject: identitySnapshots })
            .from(timeouts)
            .innerJoin(identitySnapshots, eq(timeouts.subjectSnapshotId, identitySnapshots.id))
            .where(and(eq(timeouts.id, action.recordUuid), eq(timeouts.guildId, guildId)))
            .limit(1);
        const row = rows[0];
        return row
            ? {
                  actionId: action,
                  caseType: 'timeout',
                  actionName: 'timeout',
                  subjectUserId: row.subject.discordUserId,
                  record: row.record,
              }
            : null;
    }

    return null;
}

async function applyActionUpdate(
    guild: Guild,
    loaded: LoadedAction,
    kind: UpdateChangeKind,
    rawValue: string,
    rationale: string,
): Promise<{ label: string; oldDisplay: string | null; newDisplay: string; metadata: Record<string, unknown> }> {
    if (!rawValue) throw new Error('New value cannot be empty.');
    const db = getDb();
    const id = loaded.actionId.recordUuid;

    if (kind === 'reason') {
        const oldValue = stringValue(loaded.record.reason);
        await updateTextField(loaded, 'reason', rawValue);
        return { label: 'Reason Updated', oldDisplay: oldValue, newDisplay: rawValue, metadata: {} };
    }

    if (kind === 'note') {
        const oldValue = stringValue(
            loaded.actionId.recordType === 'ban' || loaded.actionId.recordType === 'softban'
                ? loaded.record.privateNotes
                : loaded.record.privateNote,
        );
        await updateTextField(loaded, 'note', rawValue);
        return { label: 'Note Updated', oldDisplay: oldValue, newDisplay: rawValue, metadata: {} };
    }

    if (kind === 'duration') {
        if (loaded.caseType !== 'ban' && loaded.caseType !== 'timeout') throw new Error('Only bans and timeouts have durations.');
        const durationMs = parseDurationToMs(rawValue);
        if (durationMs <= 0) throw new Error('Please enter a valid duration.');
        const expiresAt = new Date(Date.now() + durationMs);
        if (loaded.caseType === 'ban') {
            await db.update(bans).set({ expiresAt }).where(eq(bans.id, id));
        } else {
            await db.update(timeouts).set({ durationMs, durationToken: rawValue, expiresAt }).where(eq(timeouts.id, id));
            await updateDiscordTimeout(guild, loaded.subjectUserId, durationMs, rationale);
        }
        return {
            label: 'Duration Updated',
            oldDisplay: displayExpiresAt(loaded.record.expiresAt),
            newDisplay: `${rawValue} (${displayExpiresAt(expiresAt)})`,
            metadata: { durationMs, expiresAt: expiresAt.toISOString() },
        };
    }

    if (kind === 'expiration') {
        if (!['warning', 'ban', 'timeout'].includes(loaded.caseType)) throw new Error('This action type does not have an expiration.');
        const expiresAt = parseExpiration(rawValue);
        if (loaded.caseType === 'warning') {
            await db.update(warnings).set({ expiresAt }).where(eq(warnings.id, id));
        } else if (loaded.caseType === 'ban') {
            await db.update(bans).set({ expiresAt }).where(eq(bans.id, id));
        } else {
            if (!expiresAt) throw new Error('Timeout expiration cannot be cleared.');
            const durationMs = expiresAt.getTime() - Date.now();
            if (durationMs <= 0) throw new Error('Expiration must be in the future.');
            await db.update(timeouts).set({ durationMs, durationToken: rawValue, expiresAt }).where(eq(timeouts.id, id));
            await updateDiscordTimeout(guild, loaded.subjectUserId, durationMs, rationale);
        }
        return {
            label: 'Expiration Updated',
            oldDisplay: displayExpiresAt(loaded.record.expiresAt),
            newDisplay: displayExpiresAt(expiresAt),
            metadata: { expiresAt: expiresAt?.toISOString() ?? null },
        };
    }

    if (kind === 'purge-duration') {
        if (loaded.caseType !== 'ban') throw new Error('Only bans and soft-bans have a purge duration.');
        const seconds = parseDurationToSeconds(rawValue);
        if (seconds <= 0) throw new Error('Please enter a valid purge duration.');
        if (seconds > MAX_PURGE_SECONDS) throw new Error('Purge duration cannot exceed 7 days.');
        await db.update(bans).set({ deleteMessageSeconds: seconds }).where(eq(bans.id, id));
        return {
            label: 'Purge Duration Updated',
            oldDisplay: loaded.record.deleteMessageSeconds ? `${loaded.record.deleteMessageSeconds}s` : 'None',
            newDisplay: `${seconds}s`,
            metadata: { deleteMessageSeconds: seconds },
        };
    }

    throw new Error('Unsupported update type.');
}

async function updateTextField(loaded: LoadedAction, field: 'reason' | 'note', value: string): Promise<void> {
    const db = getDb();
    const id = loaded.actionId.recordUuid;
    if (field === 'reason') {
        if (loaded.caseType === 'warning') await db.update(warnings).set({ reason: value }).where(eq(warnings.id, id));
        else if (loaded.caseType === 'kick') await db.update(kicks).set({ reason: value }).where(eq(kicks.id, id));
        else if (loaded.caseType === 'ban') await db.update(bans).set({ reason: value }).where(eq(bans.id, id));
        else await db.update(timeouts).set({ reason: value }).where(eq(timeouts.id, id));
        return;
    }
    if (loaded.caseType === 'warning') await db.update(warnings).set({ privateNote: value }).where(eq(warnings.id, id));
    else if (loaded.caseType === 'kick') await db.update(kicks).set({ privateNote: value }).where(eq(kicks.id, id));
    else if (loaded.caseType === 'ban') await db.update(bans).set({ privateNotes: value }).where(eq(bans.id, id));
    else await db.update(timeouts).set({ privateNote: value }).where(eq(timeouts.id, id));
}

async function refreshModLogAudit(client: Client, guild: Guild, loaded: LoadedAction): Promise<void> {
    const modLog = await findModLogByCase(loaded.caseType, loaded.actionId.recordUuid);
    if (!modLog) return;
    const channel = await client.channels.fetch(modLog.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    const message = await channel.messages.fetch(modLog.messageId).catch(() => null);
    if (!message || message.embeds.length === 0) return;

    const audits = await listModerationActionAudits(loaded.actionId.actionId);
    const auditValue = formatAuditLogField(audits);
    const current = message.embeds[0];
    const embed = EmbedBuilder.from(current);
    const fields = (current.fields || []).filter((field) => field.name !== 'Audit Log');
    fields.push({ name: 'Audit Log', value: truncate(auditValue, 1024), inline: false });
    embed.setFields(fields);
    await message.edit({ embeds: [embed] }).catch(console.error);
}

async function postThreadAuditEmbed(
    client: Client,
    guild: Guild,
    loaded: LoadedAction,
    moderator: User,
    changeLabel: string,
    newValue: string,
    rationale: string,
    notificationResult: NotificationResult,
): Promise<void> {
    const modLog = await findModLogByCase(loaded.caseType, loaded.actionId.recordUuid);
    if (!modLog?.threadId) return;
    const thread = await client.channels.fetch(modLog.threadId).catch(() => null);
    if (!thread?.isTextBased() || thread.isDMBased()) return;
    const member = await guild.members.fetch(moderator.id).catch(() => null);
    await thread.send({
        embeds: [
            createEmbed({
                color: EmbedColors.WARNING,
                title: `${titleCase(loaded.actionName)} updated`,
                fields: [
                    {
                        name: 'Moderator Information',
                        value: `Tag: ${moderator.tag}\nName: ${member?.displayName || moderator.username}\nID: \`${moderator.id}\``,
                        inline: false,
                    },
                    { name: 'Change', value: changeLabel, inline: true },
                    { name: 'New value', value: truncate(newValue, 1024), inline: false },
                    { name: 'Rationale', value: truncate(rationale, 1024), inline: false },
                    {
                        name: 'Notification',
                        value: truncate(formatNotificationResult(notificationResult), 1024),
                        inline: false,
                    },
                ],
            }),
        ],
    }).catch(console.error);
}

async function handleUserNotification(
    client: Client,
    guild: Guild,
    loaded: LoadedAction,
    changeLabel: string,
    newValue: string,
    mode: NotificationMode,
    auditId: string,
): Promise<NotificationResult> {
    if (mode === 'no') return { status: 'not-requested' };
    if (changeLabel === 'Note Updated') return { status: 'skipped', detail: 'Private notes are not user-visible.' };
    if (mode === 'silent-edit') return editOriginalActionDm(client, loaded, changeLabel, newValue);
    return sendUserUpdateDm(client, guild, loaded, changeLabel, newValue, auditId);
}

async function editOriginalActionDm(
    client: Client,
    loaded: LoadedAction,
    changeLabel: string,
    newValue: string,
): Promise<NotificationResult> {
    const stored = await findLatestActionNotification(loaded.actionId.actionId, 'action-dm');
    if (!stored) return { status: 'failed', detail: 'Original action DM was not stored.' };
    const channel = await client.channels.fetch(stored.channelId).catch(() => null);
    if (!channel?.isTextBased()) {
        return { status: 'failed', detail: 'Original DM channel is unavailable.' };
    }
    const message = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (!message) return { status: 'failed', detail: 'Original DM message is unavailable.' };

    const current = message.embeds[0];
    const embed = current
        ? EmbedBuilder.from(current)
        : createEmbed({
              color: EmbedColors.WARNING,
              title: 'Moderation action updated',
              description: `**Action ID**: \`${loaded.actionId.actionId}\``,
          });
    const fields = [...(current?.fields || [])];
    upsertUserDmField(fields, fieldNameForChange(changeLabel), userFacingValueForChange(changeLabel, newValue, loaded.actionName));
    embed.setFields(fields);
    try {
        const edited = await message.edit({ embeds: [embed] });
        return { status: 'edited', channelId: edited.channelId, messageId: edited.id };
    } catch (err) {
        return { status: 'failed', detail: errorMessage(err) };
    }
}

async function sendUserUpdateDm(
    client: Client,
    guild: Guild,
    loaded: LoadedAction,
    changeLabel: string,
    newValue: string,
    auditId: string,
): Promise<NotificationResult> {
    if (!loaded.subjectUserId) return { status: 'failed', detail: 'No subject user was stored.' };
    const user = await client.users.fetch(loaded.subjectUserId).catch(() => null);
    if (!user) return { status: 'failed', detail: 'Subject user could not be fetched.' };
    const dm = await tryDmUser(user, {
        embeds: [
            userUpdateDmEmbed({
                guild,
                loaded,
                changeLabel,
                newValue,
            }),
        ],
    });
    if (!dm.sent || !dm.channelId || !dm.messageId) {
        return { status: 'failed', detail: dm.reason || 'DM was not delivered.' };
    }
    await createModerationActionNotification({
        guildId: loaded.actionId.guildId,
        actionId: loaded.actionId.actionId,
        recordType: loaded.actionId.recordType,
        recordUuid: loaded.actionId.recordUuid,
        kind: 'update-dm',
        userId: loaded.subjectUserId,
        channelId: dm.channelId,
        messageId: dm.messageId,
        auditId,
    }).catch(console.error);
    return { status: 'delivered', channelId: dm.channelId, messageId: dm.messageId };
}

function userUpdateDmEmbed(opts: {
    guild: Guild;
    loaded: LoadedAction;
    changeLabel: string;
    newValue: string;
}) {
    const fields = [
        {
            name: fieldNameForChange(opts.changeLabel),
            value: truncate(userFacingValueForChange(opts.changeLabel, opts.newValue, opts.loaded.actionName), 1024),
            inline: false,
        },
        {
            name: 'Appeal',
            value: `You may be able to appeal this action. You can do so on our [appeals form here](${appealUrl(opts.loaded.actionId.actionId)}).`,
            inline: false,
        },
    ];

    return createEmbed(
        {
            color: userUpdateDmColor(opts.loaded.actionName),
            title: `Your ${userActionNoun(opts.loaded.actionName)} in ${opts.guild.name} has been updated`,
            description: `**Action ID**: \`${opts.loaded.actionId.actionId}\``,
            fields,
        },
        true,
    );
}

function userUpdateDmColor(actionName: string): number {
    return actionName === 'ban' || actionName === 'soft-ban' ? EmbedColors.FAILURE : EmbedColors.WARNING;
}

function userActionNoun(actionName: string): string {
    if (actionName === 'timeout') return 'mute';
    return actionName;
}

async function updateActionLinks(guildId: string, loaded: LoadedAction): Promise<string> {
    const modLog = await findModLogByCase(loaded.caseType, loaded.actionId.recordUuid);
    const links = [
        modLog ? `[View mod log](${modLogMessageUrl(guildId, modLog.channelId, modLog.messageId)})` : null,
        `[View on ATC](${modPortalUrl(loaded.actionId.actionId)})`,
    ];
    return links.filter(Boolean).join(' • ');
}

function upsertUserDmField(fields: { name: string; value: string; inline?: boolean }[], name: string, value: string): void {
    const existing = fields.find((field) => field.name === name);
    if (existing) {
        existing.value = truncate(value, 1024);
        return;
    }
    fields.unshift({ name, value: truncate(value, 1024), inline: false });
}

function fieldNameForChange(changeLabel: string): string {
    if (changeLabel === 'Reason Updated') return 'Reason';
    if (changeLabel === 'Duration Updated' || changeLabel === 'Expiration Updated') return 'Expires';
    if (changeLabel === 'Purge Duration Updated') return 'Purge duration';
    return 'Update';
}

function userFacingValueForChange(changeLabel: string, newValue: string, actionName: string): string {
    if (changeLabel === 'Duration Updated' || changeLabel === 'Expiration Updated') {
        if (newValue === 'None') return `This ${userActionNoun(actionName)} no longer has an expiration.`;
        const timestamp = newValue.match(/<t:\d+:[A-Za-z]>/)?.[0] || newValue;
        return `This ${userActionNoun(actionName)} will now expire at ${timestamp}`;
    }
    return newValue;
}

async function updateDiscordTimeout(guild: Guild, userId: string | null, durationMs: number, reason: string): Promise<void> {
    if (!userId) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member?.manageable) return;
    await member.timeout(Math.min(durationMs, MAX_TIMEOUT_MS), reason).catch(console.error);
}

function parseExpiration(raw: string): Date | null {
    if (/^(clear|none|never|no expiration)$/i.test(raw.trim())) return null;
    const durationMs = parseDurationToMs(raw);
    if (durationMs <= 0) throw new Error('Please enter a valid expiration.');
    return new Date(Date.now() + durationMs);
}

function formatAuditLogField(audits: Awaited<ReturnType<typeof listModerationActionAudits>>): string {
    if (audits.length === 0) return 'No audit entries yet.';
    const shown = audits.slice(0, 3).map((audit) => quoteBlock(formatAuditSummary(audit)));
    const remaining = audits.length - shown.length;
    if (remaining > 0) shown.push(`[${remaining} more actions]`);
    return truncate(shown.join('\n\n'), 1024);
}

function quoteBlock(value: string): string {
    return value
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
}

function formatAuditSummary(audit: Awaited<ReturnType<typeof listModerationActionAudits>>[number]): string {
    const moderatorId = audit.moderatorUserId;
    const name = audit.moderator?.username || 'Unknown';
    return [
        `**Moderator**: <@${moderatorId}> (${name} - ${moderatorId})`,
        `**At**: <t:${Math.floor(audit.createdAt.getTime() / 1000)}:F>`,
        `**Change**: ${audit.changeType}`,
        `**Rationale**: ${truncate(audit.rationale, 180)}`,
        auditNotificationLine(audit.metadata),
    ]
        .filter(Boolean)
        .join('\n');
}

function formatNotificationResult(result: NotificationResult): string {
    const status =
        result.status === 'not-requested'
            ? 'No notification requested'
            : result.status === 'edited'
              ? 'Silent edit succeeded'
              : result.status === 'delivered'
                ? 'Notification delivered'
                : result.status === 'skipped'
                  ? 'Skipped'
                  : 'Failed';
    return result.detail ? `${status} — ${result.detail}` : status;
}

function auditNotificationLine(metadata: Record<string, unknown>): string | null {
    const mode = typeof metadata.notificationMode === 'string' ? metadata.notificationMode : 'no';
    const status = typeof metadata.notificationStatus === 'string' ? metadata.notificationStatus : null;
    const detail = typeof metadata.notificationDetail === 'string' ? metadata.notificationDetail : null;
    if (mode === 'no' && (!status || status === 'not-requested')) return null;
    return `**Notification**: ${formatNotificationResult({ status: status || mode, detail: detail || undefined })}`;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

function displayExpiresAt(value: unknown): string {
    if (!value) return 'None';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function stringValue(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    return String(value);
}

function truncate(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function titleCase(value: string): string {
    return value
        .split(/[-\s]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function errorEmbed(description: string) {
    return createEmbed({ color: EmbedColors.FAILURE, title: 'Error', description });
}
