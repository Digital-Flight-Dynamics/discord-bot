import { Client, Message } from 'discord.js';
import { channels, roleGroups, roles } from '../config';
import { createPendingModeration, markPendingFailed } from '../db/repositories/pendingModeration';
import type { PendingModerationAction } from '../db/schema';
import { EmbedColors } from './embed';
import { executePendingModeration, type ModerationFailureContext } from './moderationExecute';
import { logModerationAction } from './moderationNotify';
import { MAX_DISCORD_TIMEOUT_MS, formatDurationMs } from './moderationDuration';

const HONEYPOT_PURGE_SECONDS = 2 * 60 * 60;
const HONEYPOT_REASON =
    'You sent a message in our bot honeypot channel. Your account might be compromised. ' +
    'Change your passwords, log out of all sessions and remove all account connections. ' +
    'You have been removed from the server to prevent your account from spreading spam/scam messages. ' +
    'Once you have recovered your account, feel free to appeal.';

const processing = new Set<string>();

/** Hard-ban and create a normal moderation case for anyone posting in the honeypot channel. */
export async function handleHoneypotMessage(client: Client, message: Message): Promise<boolean> {
    if (!message.inGuild() || message.author.bot || message.channelId !== channels.honeypot) {
        return false;
    }

    const key = `${message.guildId}:${message.author.id}`;
    if (processing.has(key)) return true;
    processing.add(key);

    let failureStage = 'initialization';
    let failureHandled = false;
    let pending: PendingModerationAction | null = null;

    const handleFailure = async (context: ModerationFailureContext): Promise<void> => {
        if (failureHandled) return;
        failureHandled = true;
        try {
            await logHoneypotFailure(message, context);
        } finally {
            await applyMaximumHoneypotTimeout(message, context.stage);
        }
    };

    try {
        if (!client.user) throw new Error('Bot user is unavailable');

        const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
        failureStage = 'initial timeout';
        if (!member) throw new Error('Member could not be fetched for the initial timeout');
        await member.timeout(60_000, 'Honeypot triggered; ban pending');

        failureStage = 'message deletion';
        await message.delete();
        await deleteRecentHoneypotMessages(message);

        failureStage = 'pending moderation creation';
        pending = await createPendingModeration({
            guildId: message.guildId,
            actionType: 'ban',
            subjectUserId: message.author.id,
            moderatorUserId: client.user.id,
            reason: HONEYPOT_REASON,
            deleteMessageSeconds: HONEYPOT_PURGE_SECONDS,
            banType: 'hard',
            payload: { automation: 'Honeypot' },
        });
        failureStage = 'honeypot trigger log';
        const triggerLog = await logModerationAction(message.guild, {
            title: 'Honeypot triggered',
            color: EmbedColors.FAILURE,
            caseType: 'other',
            caseId: pending.id,
            subjectUserId: message.author.id,
            subjectTag: message.author.tag,
            moderatorId: client.user.id,
            description: `<@${message.author.id}> triggered the honeypot. Ban pending.`,
            fields: [
                { name: 'Source', value: 'Automated honeypot', inline: true },
                { name: 'Message', value: message.url, inline: true },
                { name: 'Action', value: 'Hard ban with two-hour message purge', inline: false },
            ],
            threadIntro: 'The honeypot was triggered. The ban will be recorded in the follow-up moderation action log.',
        });
        if (!triggerLog) throw new Error('Honeypot trigger could not be written to mod-logs');

        failureStage = 'ban';
        const result = await executePendingModeration(client, pending, {
            onFailure: handleFailure,
        });
        if (result.status === 'not-executed' && result.reason !== 'Action was already claimed or completed.') {
            await handleFailure({ stage: failureStage, error: result.reason });
        }
    } catch (err) {
        console.error(`[ERROR] Failed to process honeypot message from ${message.author.id}:`, err);
        if (pending) await markPendingFailed(pending.id).catch(console.error);
        await handleFailure({ stage: failureStage, error: err }).catch((failureErr) =>
            console.error(`[ERROR] Failed to record honeypot failure for ${message.author.id}:`, failureErr),
        );
    } finally {
        processing.delete(key);
    }

    return true;
}

async function deleteRecentHoneypotMessages(message: Message): Promise<void> {
    if (!message.channel.isTextBased() || !('bulkDelete' in message.channel)) {
        throw new Error('Honeypot channel does not support bulk message deletion');
    }
    const recentMessages = await message.channel.messages.fetch({ limit: 100 });
    const messagesToDelete = recentMessages.filter(
        (candidate) =>
            candidate.author.id === message.author.id &&
            Date.now() - candidate.createdTimestamp < 14 * 24 * 60 * 60 * 1000,
    );
    if (messagesToDelete.size > 0) {
        await message.channel.bulkDelete(messagesToDelete);
    }
}

function moderationRoleIds(): string[] {
    return [...new Set([...roleGroups.moderation, roles.management, roles.moderator])];
}

async function logHoneypotFailure(message: Message, context: ModerationFailureContext): Promise<void> {
    const error = context.error instanceof Error ? context.error.message : String(context.error);
    const roleIds = moderationRoleIds();
    await logModerationAction(message.guild!, {
        title: 'Honeypot processing failed',
        color: EmbedColors.FAILURE,
        caseType: 'other',
        caseId: message.id,
        actionId: context.actionId,
        subjectUserId: message.author.id,
        subjectTag: message.author.tag,
        fields: [
            { name: 'Failed at', value: context.stage, inline: true },
            { name: 'Error', value: error.slice(0, 1_000), inline: false },
            { name: 'Required follow-up', value: `User was/should be timed out for ${formatDurationMs(MAX_DISCORD_TIMEOUT_MS)}.`, inline: false },
        ],
        content: roleIds.map((id) => `<@&${id}>`).join(' '),
        allowedMentions: { roles: roleIds },
        threadIntro: `Honeypot automation failed during **${context.stage}**. Staff intervention is required.`,
    });
}

async function applyMaximumHoneypotTimeout(message: Message, stage: string): Promise<void> {
    const member = message.member || (await message.guild?.members.fetch(message.author.id).catch(() => null));
    if (!member) {
        console.error(`[ERROR] Cannot apply honeypot fallback timeout to ${message.author.id}: member unavailable`);
        return;
    }
    await member
        .timeout(MAX_DISCORD_TIMEOUT_MS, `Honeypot failed during ${stage}; maximum fallback timeout`)
        .catch((err) => console.error(`[ERROR] Failed to apply honeypot fallback timeout to ${message.author.id}:`, err));
}
