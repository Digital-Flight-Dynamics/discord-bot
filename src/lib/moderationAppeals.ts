import { Client, EmbedBuilder } from 'discord.js';
import { findActionId } from '../db/repositories/actionIds';
import { findModLogByActionId, markModLogMessageDeleted } from '../db/repositories/modLogMessages';
import type { AtcInternalEvent } from './atcEvents';
import { normalizeActionId } from './actionId';
import { createEmbed, EmbedColors } from './embed';
import { appealProgressUrl, modPortalUrl } from './moderationFormat';
import { handleDeletedModLogThread } from './moderationMessageTracker';

const titlePrefixByEvent: Partial<Record<AtcInternalEvent['type'], string>> = {
    'appeal.approved': 'APPEAL APPROVED',
    'moderation.action.revoked': 'REVOKED',
};

const eventPresentation: Record<AtcInternalEvent['type'], { color: number; description: string }> = {
    'moderation.action.created': { color: EmbedColors.DFD_BLUE, description: '📝 Moderation action created on ATC.' },
    'moderation.action.updated': { color: EmbedColors.DFD_BLUE, description: '📝 Moderation action updated on ATC.' },
    'moderation.action.revoked': { color: EmbedColors.WARNING, description: '⚪ The moderation action was revoked.' },
    'appeal.submitted': { color: EmbedColors.WARNING, description: '📨 The user submitted an appeal.' },
    'appeal.review_started': { color: EmbedColors.WARNING, description: '🟠 Moderation review of the appeal has started.' },
    'appeal.approved': { color: EmbedColors.SUCCESS, description: '🟢 The appeal was approved.' },
    'appeal.denied': { color: EmbedColors.FAILURE, description: '🔴 The appeal was denied.' },
};

/** Apply an authenticated ATC event to the matching Discord moderation log. */
export async function handleAtcDiscordEvent(client: Client, event: AtcInternalEvent): Promise<void> {
    const actionId = normalizeActionId(event.actionId);
    const action = await findActionId(actionId);
    if (!action || action.guildId !== event.guildId) throw new Error('Action ID not found.');

    const modLog = await findModLogByActionId(event.guildId, actionId);
    if (!modLog) throw new Error('Mod-log message not found for this action.');
    if (modLog.messageDeleted) return;

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

    const prefix = titlePrefixByEvent[event.type];
    const current = message.embeds[0];
    if (prefix && current) {
        const title = (current.title || 'A moderation action').replace(
            /^\[(?:PENDING APPEAL|REVOKED|APPEAL APPROVED|APPEAL DENIED)\]\s*/i,
            '',
        );
        await message.edit({ embeds: [EmbedBuilder.from(current).setTitle(`[${prefix}] ${title}`)] });
    }

    const url = event.appealId ? appealProgressUrl(actionId, event.appealId) : modPortalUrl(actionId);
    if (event.type === 'appeal.submitted') {
        await message.reply({ content: `📨 **User has submitted an appeal.** [View on ATC](${url})` });
    }

    if (!modLog.threadId || modLog.threadDeleted) return;
    const thread = await client.channels.fetch(modLog.threadId).catch(() => null);
    if (!thread?.isTextBased() || thread.isDMBased()) {
        await handleDeletedModLogThread(client, modLog);
        return;
    }

    const presentation = eventPresentation[event.type];
    await thread.send({
        embeds: [
            createEmbed(
                {
                    color: presentation.color,
                    description: `${presentation.description} [View on ATC](${url})`,
                },
            ),
        ],
    });
}

/** Backwards-compatible direct entry point for an appeal submission. */
export async function logAppealSubmitted(
    client: Client,
    guildId: string,
    actionId: string,
    appealId?: string,
): Promise<void> {
    await handleAtcDiscordEvent(client, {
        id: appealId || actionId,
        type: 'appeal.submitted',
        occurredAt: new Date().toISOString(),
        guildId,
        actionId,
        ...(appealId ? { appealId } : {}),
    });
}
