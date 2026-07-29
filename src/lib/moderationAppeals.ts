import { Client, EmbedBuilder } from 'discord.js';
import { findActionId } from '../db/repositories/actionIds';
import { findModLogByActionId, markModLogMessageDeleted } from '../db/repositories/modLogMessages';
import { createEmbed, EmbedColors } from './embed';
import { modPortalUrl } from './moderationFormat';
import { handleDeletedModLogThread } from './moderationMessageTracker';
import { normalizeActionId } from './actionId';

/**
 * Update Discord when ATC records a new appeal.
 * The future appeal-submission event can call this directly.
 */
export async function logAppealSubmitted(client: Client, guildId: string, rawActionId: string): Promise<void> {
    const actionId = normalizeActionId(rawActionId);
    const action = await findActionId(actionId);
    if (!action || action.guildId !== guildId) throw new Error('Action ID not found.');

    const modLog = await findModLogByActionId(guildId, actionId);
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
    if (!message.embeds[0]) return;

    const current = message.embeds[0];
    const title = (current.title || 'A moderation action').replace(
        /^\[(?:PENDING APPEAL|REVOKED|APPEAL APPROVED)\]\s*/i,
        '',
    );
    await message.edit({
        embeds: [EmbedBuilder.from(current).setTitle(`[PENDING APPEAL] ${title}`)],
    });

    if (!modLog.threadId || modLog.threadDeleted) return;
    const thread = await client.channels.fetch(modLog.threadId).catch(() => null);
    if (!thread?.isTextBased() || thread.isDMBased()) {
        await handleDeletedModLogThread(client, modLog);
        return;
    }
    await thread.send({
        embeds: [
            createEmbed(
                {
                    color: EmbedColors.WARNING,
                    description: `User submitted an appeal. [View on ATC](${modPortalUrl(actionId)})`,
                },
                true,
            ),
        ],
    });
}
