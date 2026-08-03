import {
    ChatInputCommandInteraction,
    Client,
    DiscordAPIError,
    EmbedBuilder,
    Guild,
    RESTJSONErrorCodes,
    User,
} from 'discord.js';
import {
    createModerationActionAudit,
    listModerationActionAudits,
    updateModerationActionAuditMetadata,
} from './db/repositories/moderationActionAudits';
import { denyAppeal, startAppealReview } from './db/repositories/atcAppeals';
import {
    createModerationActionNotification,
    findLatestActionNotification,
    markActionNotificationFailed,
} from './db/repositories/moderationActionNotifications';
import { findModLogByCase, markModLogMessageDeleted } from './db/repositories/modLogMessages';
import { captureIdentitySnapshot } from './db/repositories/snapshots';
import { createEmbed, EmbedColors } from './lib/embed';
import { tryDmUser } from './lib/moderationNotify';
import { isPermanentDuration, parseDurationToMs, parseDurationToSeconds } from './lib/moderation';
import { hasOtherActiveBan } from './db/repositories/bans';
import { hasRoleAccess } from './lib/moderationAccess';
import { moderationTextForEmbed, MAX_PRIVATE_NOTE_LENGTH, MAX_REASON_LENGTH } from './lib/moderationLimits';
import { appealProgressUrl, appealUrl, discordAuditReason, modLogMessageUrl, modPortalUrl } from './lib/moderationFormat';
import { handleAtcDiscordEvent } from './lib/moderationAppeals';
import { handleDeletedModLogThread } from './lib/moderationMessageTracker';
import { normalizeActionId } from './lib/actionId';
import {
    commitActionEdit,
    commitActionResolution,
    loadAction,
    updateActionRecordExpiration,
    updateActionText,
    updateBanDuration,
    updateBanPurgeDuration,
    updateTimeoutDuration,
    type ActionUpdateExecutor,
    type AppliedActionEdit,
    type LoadedAction,
} from './db/repositories/moderationActions';
import { MAX_DISCORD_TIMEOUT_MS, MAX_PURGE_SECONDS } from './lib/moderationDuration';

const MAX_TIMEOUT_MS = MAX_DISCORD_TIMEOUT_MS;

type UpdateChangeKind = 'reason' | 'note' | 'duration' | 'expiration' | 'purge-duration';
type NotificationMode = 'no' | 'silent-edit' | 'notify';
type ResolutionStatus = 'revoked' | 'appeal-approved';
type NotificationResult = { status: string; detail?: string; channelId?: string; messageId?: string };



export async function handleUpdateActionCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (interaction.commandName !== 'update-action') return false;
    if (!interaction.guild) {
        await interaction.reply({ embeds: [errorEmbed('This command can only be used in a server.')], ephemeral: true });
        return true;
    }
    const actingMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!hasRoleAccess(actingMember, 'moderation')) {
        await interaction.reply({ embeds: [errorEmbed('You do not have a configured moderation role.')], ephemeral: true });
        return true;
    }

    await interaction.reply({ embeds: [createEmbed({ color: 0xf97316, description: '*Working on it...*' })], ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'review-appeal' || subcommand === 'deny-appeal') {
        await handleAppealLifecycle(interaction, subcommand);
        return true;
    }
    if (subcommand === 'revoke') {
        await handleActionResolution(interaction);
        return true;
    }

    const kind = subcommand.replace(/^change-/, '') as UpdateChangeKind;
    const actionId = normalizeActionId(interaction.options.getString('action-id', true));
    const newValue = getNewValue(interaction, kind);
    const rationale = interaction.options.getString('rationale', true).trim();
    const notificationMode = (interaction.options.getString('notification-mode') || 'no') as NotificationMode;

    try {
        const initialLoaded = await loadAction(interaction.guild.id, actionId);
        if (!initialLoaded) {
            await interaction.editReply({ embeds: [errorEmbed('Action ID not found.')] });
            return true;
        }
        let loaded = initialLoaded;

        const moderatorMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const moderatorSnap = await captureIdentitySnapshot({
            member: moderatorMember || undefined,
            user: interaction.user,
            discordUserId: interaction.user.id,
        });
        let previousTimeoutMs: number | null | undefined;
        let committed;
        try {
            committed = await commitActionEdit({
                loaded,
                moderatorSnapshotId: moderatorSnap.id,
                moderatorUserId: interaction.user.id,
                rationale,
                notifyUser: notificationMode === 'notify',
                notificationMode,
                apply: (db, freshLoaded) => applyActionUpdate(
                    db,
                    interaction.guild!,
                    freshLoaded,
                    kind,
                    newValue,
                    rationale,
                    interaction.user,
                    () => {
                        const oldExpiry = freshLoaded.record.expiresAt;
                        previousTimeoutMs = oldExpiry instanceof Date
                            ? Math.max(0, oldExpiry.getTime() - Date.now())
                            : null;
                    },
                ),
            });
        } catch (error) {
            if (previousTimeoutMs !== undefined) {
                await restoreUpdatedTimeout(interaction.guild, loaded, previousTimeoutMs, interaction.user).catch(
                    (restoreError) => console.error('[ERROR] Failed to compensate timeout after update rollback:', restoreError),
                );
            }
            throw error;
        }
        const { applied, audit } = committed;
        loaded = committed.loaded;

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
        await refreshModLogAudit(interaction.client, interaction.guild, loaded);
        await postThreadAuditEmbed(
            interaction.client,
            interaction.guild,
            loaded,
            interaction.user,
            applied.label,
            applied.newDisplay,
            rationale,
            notificationResult,
        );

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

async function handleActionResolution(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;
    const actionId = normalizeActionId(interaction.options.getString('action-id', true));
    const status = interaction.options.getString('outcome', true) as ResolutionStatus;
    const reason = interaction.options.getString('reason', true).trim();
    const publicNote = interaction.options.getString('public-note')?.trim() || null;
    const appealId = interaction.options.getString('appeal-id')?.trim() || null;
    const label = status === 'appeal-approved' ? 'Appeal Approved' : 'Action Revoked';

    try {
        if (status === 'appeal-approved' && !appealId) {
            throw new Error('Appeal ID is required when approving an appeal.');
        }
        const loaded = await loadAction(guild.id, actionId);
        if (!loaded) {
            await interaction.editReply({ embeds: [errorEmbed('Action ID not found.')] });
            return;
        }
        if (loaded.record.resolutionStatus) {
            throw new Error(`This action has already been resolved as ${titleCase(String(loaded.record.resolutionStatus))}.`);
        }

        const moderatorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
        const moderatorSnap = await captureIdentitySnapshot({
            member: moderatorMember || undefined,
            user: interaction.user,
            discordUserId: interaction.user.id,
        });

        const { audit, userNotUnbanned } = await commitActionResolutionAndAudit({
            guild,
            moderator: interaction.user,
            loaded,
            status,
            reason,
            publicNote,
            moderatorSnapshotId: moderatorSnap.id,
            moderatorUserId: interaction.user.id,
            label,
            appealId,
        });

        const notificationResult = await editResolutionDm(interaction.client, loaded, status, publicNote);
        await updateModerationActionAuditMetadata(audit.id, {
            resolutionStatus: status,
            publicNote,
            notificationMode: 'silent-edit',
            notificationStatus: notificationResult.status,
            notificationDetail: notificationResult.detail ?? null,
            notificationChannelId: notificationResult.channelId ?? null,
            notificationMessageId: notificationResult.messageId ?? null,
            userNotUnbanned,
        });

        await refreshModLogAudit(interaction.client, guild, loaded, status);
        await postThreadResolutionEmbed(
            interaction.client,
            guild,
            loaded,
            interaction.user,
            status,
            reason,
            publicNote,
            notificationResult,
            userNotUnbanned,
            appealId,
        );

        const links = await updateActionLinks(guild.id, loaded);
        await interaction.editReply({
            embeds: [
                createEmbed({
                    color: EmbedColors.SUCCESS,
                    description:
                        `Done, action has been ${status === 'appeal-approved' ? 'marked as appeal approved' : 'revoked'}` +
                        (userNotUnbanned ? '\n\nUser was not unbanned as they have another active ban on their account.' : '') +
                        `\n\n${links}`,
                }),
            ],
        });
    } catch (err) {
        console.error('[ERROR] Failed to revoke moderation action:', err);
        await interaction
            .editReply({ embeds: [errorEmbed(err instanceof Error ? err.message : 'Something went wrong.')] })
            .catch(console.error);
    }
}

async function handleAppealLifecycle(
    interaction: ChatInputCommandInteraction,
    operation: 'review-appeal' | 'deny-appeal',
): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;
    const actionId = normalizeActionId(interaction.options.getString('action-id', true));
    const appealId = interaction.options.getString('appeal-id', true).trim();
    const loaded = await loadAction(guild.id, actionId);
    if (!loaded) {
        await interaction.editReply({ embeds: [errorEmbed('Action ID not found.')] });
        return;
    }

    try {
        const moderatorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
        const moderatorSnap = await captureIdentitySnapshot({
            member: moderatorMember || undefined,
            user: interaction.user,
            discordUserId: interaction.user.id,
        });
        const denied = operation === 'deny-appeal';
        const reason = denied ? interaction.options.getString('reason', true).trim() : 'Moderation review started.';
        const publicNote = denied ? interaction.options.getString('public-note')?.trim() || null : null;
        const appeal = denied
            ? await denyAppeal({
                  guildId: guild.id,
                  actionId,
                  appealId,
                  moderatorUserId: interaction.user.id,
                  decisionNote: publicNote,
              })
            : await startAppealReview({
                  guildId: guild.id,
                  actionId,
                  appealId,
                  moderatorUserId: interaction.user.id,
              });
        if (!appeal) throw new Error('Appeal not found, already decided, or not attached to this action.');

        await createModerationActionAudit({
            guildId: guild.id,
            actionId,
            recordType: loaded.actionId.recordType,
            recordUuid: loaded.actionId.recordUuid,
            changeType: denied ? 'Appeal Denied' : 'Appeal Review Started',
            moderatorSnapshotId: moderatorSnap.id,
            moderatorUserId: interaction.user.id,
            oldValue: null,
            newValue: denied ? 'Denied' : 'Under Review',
            rationale: reason,
            notifyUser: false,
            metadata: { appealId, publicNote },
        });

        let discordLogged = true;
        await handleAtcDiscordEvent(interaction.client, {
            id: crypto.randomUUID(),
            type: denied ? 'appeal.denied' : 'appeal.review_started',
            occurredAt: (denied ? appeal.decidedAt : appeal.reviewStartedAt)?.toISOString() || new Date().toISOString(),
            guildId: guild.id,
            actionId,
            appealId,
            actorUserId: interaction.user.id,
        }).catch((error) => {
            discordLogged = false;
            console.error(`[ATC] Appeal ${appealId} was updated, but its Discord log failed.`, error);
        });

        await interaction.editReply({
            embeds: [
                createEmbed({
                    color: denied ? EmbedColors.FAILURE : EmbedColors.WARNING,
                    description:
                        `Done, appeal has been marked as ${denied ? 'denied' : 'under review'}.\n\n` +
                        `[View on ATC](${appealProgressUrl(actionId, appealId)})` +
                        (discordLogged ? '' : '\n\n:warning: The action thread could not be updated.'),
                }),
            ],
        });
    } catch (err) {
        console.error('[ERROR] Failed to update appeal:', err);
        await interaction.editReply({ embeds: [errorEmbed(err instanceof Error ? err.message : 'Something went wrong.')] });
    }
}

function getNewValue(interaction: ChatInputCommandInteraction, kind: UpdateChangeKind): string {
    const optionNames: Record<UpdateChangeKind, string> = {
        reason: 'new-reason',
        note: 'new-note',
        duration: 'new-duration',
        expiration: 'new-expiration',
        'purge-duration': 'new-purge-duration',
    };
    const optionName = optionNames[kind];
    return interaction.options.getString(optionName, true).trim();
}

async function applyActionResolution(
    guild: Guild,
    loaded: LoadedAction,
    reason: string,
    moderator: User,
): Promise<{ userNotUnbanned: boolean; unbanned: boolean; timeoutRemoved: boolean }> {
    let userNotUnbanned = false;
    let unbanned = false;
    let timeoutRemoved = false;
    if (loaded.caseType === 'ban' && loaded.subjectUserId) {
        const otherBanExists = await hasOtherActiveBan({
            guildId: guild.id,
            discordUserId: loaded.subjectUserId,
            excludingBanId: loaded.actionId.recordUuid,
        });
        if (otherBanExists) userNotUnbanned = true;
        else {
            const activeBan = await guild.bans.fetch(loaded.subjectUserId).catch((err) => {
                if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownBan) return null;
                throw err;
            });
            if (activeBan) {
                await guild.members.unban(
                    loaded.subjectUserId,
                    discordAuditReason(loaded.actionId.actionId, moderator.username, moderator.id, reason),
                );
                unbanned = true;
            }
        }
    }

    if (loaded.caseType === 'timeout' && loaded.subjectUserId) {
        const member = await guild.members.fetch(loaded.subjectUserId).catch(() => null);
        if (member?.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now()) {
            if (!member.manageable) throw new Error('The timeout could not be removed because this member is not manageable.');
            await member.timeout(null, discordAuditReason(loaded.actionId.actionId, moderator.username, moderator.id, reason));
            timeoutRemoved = true;
        }
    }
    return { userNotUnbanned, unbanned, timeoutRemoved };
}

/** Atomically commits the case resolution and its immutable audit entry. */
async function commitActionResolutionAndAudit(input: {
    guild: Guild;
    moderator: User;
    loaded: LoadedAction;
    status: ResolutionStatus;
    reason: string;
    publicNote: string | null;
    moderatorSnapshotId: string;
    moderatorUserId: string;
    label: string;
    appealId: string | null;
}) {
    let discordEffects: Awaited<ReturnType<typeof applyActionResolution>> | null = null;
    try {
        const { audit, effect } = await commitActionResolution({
            loaded: input.loaded,
            status: input.status,
            reason: input.reason,
            publicNote: input.publicNote,
            moderatorSnapshotId: input.moderatorSnapshotId,
            moderatorUserId: input.moderatorUserId,
            label: input.label,
            appealId: input.appealId,
            applyDiscord: async () => {
                discordEffects = await applyActionResolution(
                    input.guild,
                    input.loaded,
                    input.reason,
                    input.moderator,
                );
                return discordEffects;
            },
            effectMetadata: (effects) => ({ userNotUnbanned: effects.userNotUnbanned }),
        });
        return { audit, userNotUnbanned: effect.userNotUnbanned };
    } catch (error) {
        if (discordEffects) {
            await restoreResolvedDiscordState(input, discordEffects).catch((restoreError) => {
                console.error('[ERROR] Failed to compensate Discord after resolution rollback:', restoreError);
            });
        }
        throw error;
    }
}

async function restoreResolvedDiscordState(
    input: Parameters<typeof commitActionResolutionAndAudit>[0],
    effects: Awaited<ReturnType<typeof applyActionResolution>>,
): Promise<void> {
    const subjectId = input.loaded.subjectUserId;
    if (!subjectId) return;
    const reason = discordAuditReason(
        input.loaded.actionId.actionId,
        input.moderator.username,
        input.moderator.id,
        'Restored after database transaction rollback',
    );
    if (effects.unbanned) {
        await input.guild.members.ban(subjectId, { deleteMessageSeconds: 0, reason });
    }
    if (effects.timeoutRemoved) {
        const expiresAt = input.loaded.record.expiresAt;
        const remaining = expiresAt instanceof Date ? Math.max(0, expiresAt.getTime() - Date.now()) : 0;
        const member = await input.guild.members.fetch(subjectId);
        await member.timeout(remaining > 0 ? Math.min(remaining, MAX_TIMEOUT_MS) : null, reason);
    }
}

async function applyActionUpdate(
    db: ActionUpdateExecutor,
    guild: Guild,
    loaded: LoadedAction,
    kind: UpdateChangeKind,
    rawValue: string,
    rationale: string,
    moderator: User,
    onDiscordTimeoutChanged: () => void,
): Promise<AppliedActionEdit> {
    if (!rawValue) throw new Error('New value cannot be empty.');
    if (kind === 'reason' && rawValue.length > MAX_REASON_LENGTH)
        throw new Error(`Reasons cannot exceed ${MAX_REASON_LENGTH} characters.`);
    if (kind === 'note' && rawValue.length > MAX_PRIVATE_NOTE_LENGTH)
        throw new Error(`Private notes cannot exceed ${MAX_PRIVATE_NOTE_LENGTH} characters.`);
    const id = loaded.actionId.recordUuid;

    if (kind === 'reason') {
        const oldValue = stringValue(loaded.record.reason);
        await updateActionText(db, loaded, 'reason', rawValue);
        return { label: 'Reason Updated', oldDisplay: oldValue, newDisplay: rawValue, metadata: {} };
    }

    if (kind === 'note') {
        const oldValue = stringValue(
            loaded.actionId.recordType === 'ban' || loaded.actionId.recordType === 'softban'
                ? loaded.record.privateNotes
                : loaded.record.privateNote,
        );
        await updateActionText(db, loaded, 'note', rawValue);
        return { label: 'Note Updated', oldDisplay: oldValue, newDisplay: rawValue, metadata: {} };
    }

    if (kind === 'duration') {
        if (loaded.caseType !== 'ban' && loaded.caseType !== 'timeout') throw new Error('Only bans and timeouts have durations.');
        if (loaded.caseType === 'ban' && isPermanentDuration(rawValue)) {
            await updateBanDuration(db, id, null, rawValue, null);
            return {
                label: 'Duration Updated',
                oldDisplay: displayExpiresAt(loaded.record.expiresAt),
                newDisplay: 'Permanent',
                metadata: { durationMs: null, expiresAt: null },
            };
        }
        const durationMs = parseDurationToMs(rawValue);
        if (durationMs <= 0) throw new Error('Please enter a valid duration.');
        const effectiveDurationMs = loaded.caseType === 'timeout' ? Math.min(durationMs, MAX_TIMEOUT_MS) : durationMs;
        const expiresAt = new Date(Date.now() + effectiveDurationMs);
        const clamped = loaded.caseType === 'timeout' && durationMs > MAX_TIMEOUT_MS;
        if (loaded.caseType === 'ban') {
            await updateBanDuration(db, id, durationMs, rawValue, expiresAt);
        } else {
            await updateDiscordTimeout(guild, loaded, effectiveDurationMs, rationale, moderator);
            onDiscordTimeoutChanged();
            await updateTimeoutDuration(db, id, effectiveDurationMs, rawValue, expiresAt);
        }
        return {
            label: 'Duration Updated',
            oldDisplay: displayExpiresAt(loaded.record.expiresAt),
            newDisplay: `${rawValue} (${displayExpiresAt(expiresAt)})${clamped ? ' — Discord timeout capped at 28 days' : ''}`,
            metadata: { durationMs: effectiveDurationMs, expiresAt: expiresAt.toISOString() },
        };
    }

    if (kind === 'expiration') {
        const recordExpiresAt = parseExpiration(rawValue);
        await updateActionRecordExpiration(db, loaded, recordExpiresAt);
        return {
            label: 'Expiration Updated',
            oldDisplay: displayExpiresAt(loaded.record.recordExpiresAt),
            newDisplay: displayExpiresAt(recordExpiresAt),
            metadata: { recordExpiresAt: recordExpiresAt?.toISOString() ?? null },
        };
    }

    if (kind === 'purge-duration') {
        if (loaded.caseType !== 'ban') throw new Error('Only bans and soft-bans have a purge duration.');
        const seconds = parseDurationToSeconds(rawValue);
        if (seconds <= 0) throw new Error('Please enter a valid purge duration.');
        if (seconds > MAX_PURGE_SECONDS) throw new Error('Purge duration cannot exceed 7 days.');
        await updateBanPurgeDuration(db, id, seconds);
        return {
            label: 'Purge Duration Updated',
            oldDisplay: loaded.record.deleteMessageSeconds ? `${loaded.record.deleteMessageSeconds}s` : 'None',
            newDisplay: `${seconds}s`,
            metadata: { deleteMessageSeconds: seconds },
        };
    }

    throw new Error('Unsupported update type.');
}

async function restoreUpdatedTimeout(
    guild: Guild,
    loaded: LoadedAction,
    previousDurationMs: number | null,
    moderator: User,
): Promise<void> {
    if (!loaded.subjectUserId) return;
    const member = await guild.members.fetch(loaded.subjectUserId);
    if (!member.manageable) throw new Error('Member is not manageable during timeout compensation.');
    await member.timeout(
        previousDurationMs && previousDurationMs > 0 ? Math.min(previousDurationMs, MAX_TIMEOUT_MS) : null,
        discordAuditReason(
            loaded.actionId.actionId,
            moderator.username,
            moderator.id,
            'Restored after database transaction rollback',
        ),
    );
}

async function refreshModLogAudit(
    client: Client,
    guild: Guild,
    loaded: LoadedAction,
    resolutionStatus?: ResolutionStatus,
): Promise<void> {
    const modLog = await findModLogByCase(loaded.caseType, loaded.actionId.recordUuid);
    if (!modLog || modLog.messageDeleted) return;
    const channel = await client.channels.fetch(modLog.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) {
        await markModLogMessageDeleted(modLog.id);
        return;
    }
    const message = await channel.messages.fetch(modLog.messageId).catch(() => null);
    if (!message) {
        await markModLogMessageDeleted(modLog.id);
        return;
    }
    if (message.embeds.length === 0) return;

    const audits = await listModerationActionAudits(loaded.actionId.actionId);
    const auditValue = formatAuditLogField(audits);
    const current = message.embeds[0];
    const embed = EmbedBuilder.from(current);
    embed.setDescription(
        `Action ID: \`${loaded.actionId.actionId}\` • [View on ATC](${modPortalUrl(loaded.actionId.actionId)})`,
    );
    const fields = (current.fields || []).filter((field) => field.name !== 'Audit Log');
    fields.push({ name: 'Audit Log', value: truncate(auditValue, 1024), inline: false });
    embed.setFields(fields);
    if (resolutionStatus) {
        const currentTitle = (current.title || `A user has received a ${loaded.actionName}`).replace(
            /^\[(?:PENDING APPEAL|REVOKED|APPEAL APPROVED|APPEAL DENIED)\]\s*/i,
            '',
        );
        embed.setTitle(`[${resolutionTitle(resolutionStatus)}] ${currentTitle}`);
    }
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
    if (!modLog?.threadId || modLog.messageDeleted || modLog.threadDeleted) return;
    const thread = await client.channels.fetch(modLog.threadId).catch(() => null);
    if (!thread?.isTextBased() || thread.isDMBased()) {
        await handleDeletedModLogThread(client, modLog);
        return;
    }
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

async function postThreadResolutionEmbed(
    client: Client,
    guild: Guild,
    loaded: LoadedAction,
    moderator: User,
    status: ResolutionStatus,
    reason: string,
    publicNote: string | null,
    notificationResult: NotificationResult,
    userNotUnbanned = false,
    appealId: string | null = null,
): Promise<void> {
    const modLog = await findModLogByCase(loaded.caseType, loaded.actionId.recordUuid);
    if (!modLog?.threadId || modLog.messageDeleted || modLog.threadDeleted) return;
    const thread = await client.channels.fetch(modLog.threadId).catch(() => null);
    if (!thread?.isTextBased() || thread.isDMBased()) {
        await handleDeletedModLogThread(client, modLog);
        return;
    }
    const member = await guild.members.fetch(moderator.id).catch(() => null);
    const fields = [
        {
            name: 'Moderator Information',
            value: `Tag: ${moderator.tag}\nName: ${member?.displayName || moderator.username}\nID: \`${moderator.id}\``,
            inline: false,
        },
        { name: 'Outcome', value: resolutionLabel(status), inline: false },
        ...(userNotUnbanned
            ? [{ name: 'Ban enforcement', value: 'User was not unbanned as they have another active ban on their account.', inline: false }]
            : []),
        { name: 'Reason', value: truncate(reason, 1024), inline: false },
        ...(publicNote
            ? [{ name: 'Public Note', value: truncate(quoteBlock(publicNote), 1024), inline: false }]
            : []),
        ...(appealId
            ? [{ name: 'Appeal', value: `[View on ATC](${appealProgressUrl(loaded.actionId.actionId, appealId)})`, inline: false }]
            : []),
        {
            name: 'Notification',
            value: truncate(formatNotificationResult(notificationResult), 1024),
            inline: false,
        },
    ];
    await thread
        .send({
            embeds: [
                createEmbed({
                    color: EmbedColors.WARNING,
                    title: `${titleCase(loaded.actionName)} ${status === 'appeal-approved' ? 'appeal approved' : 'revoked'}`,
                    fields,
                }),
            ],
        })
        .catch(console.error);
}

async function editResolutionDm(
    client: Client,
    loaded: LoadedAction,
    status: ResolutionStatus,
    publicNote: string | null,
): Promise<NotificationResult> {
    const stored = await findLatestActionNotification(loaded.actionId.actionId, 'action-dm');
    if (!stored) return { status: 'failed', detail: 'Original action DM was not stored.' };
    if (stored.messageDeleted) {
        return { status: 'failed', detail: stored.failureReason || 'Original DM message was deleted.' };
    }
    const channel = await client.channels.fetch(stored.channelId).catch(() => null);
    if (!channel?.isTextBased()) return { status: 'failed', detail: 'Original DM channel is unavailable.' };
    const message = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (!message) {
        const detail = 'Original DM message was deleted or is unavailable.';
        await markActionNotificationFailed(stored.id, detail);
        return { status: 'failed', detail };
    }

    const current = message.embeds[0];
    const embed = current
        ? EmbedBuilder.from(current)
        : createEmbed({
              color: EmbedColors.WARNING,
              description: `**Action ID**: \`${loaded.actionId.actionId}\``,
          });
    const baseTitle = (current?.title || `You received a ${loaded.actionName}`).replace(
        /^\[(?:REVOKED|APPEAL APPROVED)\]\s*/i,
        '',
    );
    embed.setTitle(`[${resolutionTitle(status)}] ${baseTitle}`);

    const existingFields = current?.fields || [];
    const reasonField = existingFields.find((field) => field.name.toLowerCase() === 'reason');
    const fields = existingFields
        .filter(
            (field) =>
                !['reason', 'notice', 'appeal', 'action revoked', 'appeal approved'].includes(field.name.toLowerCase()),
        )
        .map((field) => ({ name: field.name, value: field.value, inline: field.inline }));
    fields.unshift({
        name: 'Original Reason',
        value: moderationTextForEmbed(reasonField?.value || stringValue(loaded.record.reason), loaded.actionId.actionId),
        inline: false,
    });
    fields.push({
        name: resolutionLabel(status),
        value: truncate(resolutionUserMessage(status, publicNote), 1024),
        inline: false,
    });
    embed.setFields(fields);

    try {
        const edited = await message.edit({ embeds: [embed] });
        return { status: 'edited', channelId: edited.channelId, messageId: edited.id };
    } catch (err) {
        return { status: 'failed', detail: errorMessage(err) };
    }
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
    if (stored.messageDeleted) {
        return { status: 'failed', detail: stored.failureReason || 'Original DM message was deleted.' };
    }
    const channel = await client.channels.fetch(stored.channelId).catch(() => null);
    if (!channel?.isTextBased()) {
        return { status: 'failed', detail: 'Original DM channel is unavailable.' };
    }
    const message = await channel.messages.fetch(stored.messageId).catch(() => null);
    if (!message) {
        const detail = 'Original DM message was deleted or is unavailable.';
        await markActionNotificationFailed(stored.id, detail);
        return { status: 'failed', detail };
    }

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
        modLog && !modLog.messageDeleted
            ? `[View mod log](${modLogMessageUrl(guildId, modLog.channelId, modLog.messageId)})`
            : null,
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
    if (changeLabel === 'Duration Updated') return 'Duration';
    if (changeLabel === 'Expiration Updated') return 'Expiration';
    if (changeLabel === 'Purge Duration Updated') return 'Purge duration';
    return 'Update';
}

function userFacingValueForChange(changeLabel: string, newValue: string, actionName: string): string {
    if (changeLabel === 'Duration Updated') {
        if (newValue === 'Permanent') return `This ${userActionNoun(actionName)} is now permanent.`;
        const timestamp = newValue.match(/<t:\d+:[A-Za-z]>/)?.[0] || newValue;
        return `This ${userActionNoun(actionName)} will now end at ${timestamp}.`;
    }
    if (changeLabel === 'Expiration Updated') {
        if (newValue === 'None') return 'This action will remain visible on your profile.';
        const timestamp = newValue.match(/<t:\d+:[A-Za-z]>/)?.[0] || newValue;
        return `This action will no longer appear on your profile after ${timestamp}.`;
    }
    return newValue;
}

async function updateDiscordTimeout(
    guild: Guild,
    loaded: LoadedAction,
    durationMs: number,
    reason: string,
    moderator: User,
): Promise<void> {
    if (!loaded.subjectUserId) throw new Error('No subject user recorded for this action.');
    const member = await guild.members.fetch(loaded.subjectUserId).catch(() => null);
    if (!member) throw new Error('Member is no longer in this server; Discord timeout could not be updated.');
    if (!member.manageable) throw new Error('This member cannot be managed by the bot (role hierarchy); Discord timeout could not be updated.');
    await member.timeout(
        Math.min(durationMs, MAX_TIMEOUT_MS),
        discordAuditReason(loaded.actionId.actionId, moderator.username, moderator.id, reason),
    );
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
    const statuses: Record<string, string> = {
        'not-requested': 'No notification requested',
        edited: 'Silent edit succeeded',
        delivered: 'Notification delivered',
        skipped: 'Skipped',
        failed: 'Failed',
    };
    const status = statuses[result.status] || 'Failed';
    return result.detail ? `${status} — ${result.detail}` : status;
}

function auditNotificationLine(metadata: Record<string, unknown>): string | null {
    const mode = typeof metadata.notificationMode === 'string' ? metadata.notificationMode : 'no';
    const status = typeof metadata.notificationStatus === 'string' ? metadata.notificationStatus : null;
    const detail = typeof metadata.notificationDetail === 'string' ? metadata.notificationDetail : null;
    if (mode === 'no' && (!status || status === 'not-requested')) return null;
    return `**Notification**: ${formatNotificationResult({ status: status || mode, detail: detail || undefined })}`;
}

function resolutionLabel(status: ResolutionStatus): string {
    return status === 'appeal-approved' ? 'Appeal Approved' : 'Action Revoked';
}

function resolutionTitle(status: ResolutionStatus): string {
    return status === 'appeal-approved' ? 'APPEAL APPROVED' : 'REVOKED';
}

function resolutionUserMessage(status: ResolutionStatus, publicNote: string | null): string {
    const message =
        status === 'appeal-approved'
            ? 'The moderation team has approved your appeal for this action. It may remain on your account record until its duration expires.'
            : 'The moderation team has decided to revoke this action from your account.\n\nIt has been removed from your record.';
    return publicNote ? `${message}\n\n**Note from Moderation:**\n${quoteBlock(publicNote)}` : message;
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
