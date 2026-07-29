import { Client, EmbedBuilder } from 'discord.js';
import { findActionId } from '../db/repositories/actionIds';
import { findModLogByActionId } from '../db/repositories/modLogMessages';
import { createEmbed, EmbedColors } from './embed';
import { modPortalUrl } from './moderationFormat';

/**
 * Update Discord when ATC records a new appeal.
 * The future appeal-submission event can call this directly.
 */
export async function logAppealSubmitted(client: Client, guildId: string, rawActionId: string): Promise<void> {
    const actionId = rawActionId.trim().replace(/^#/, '').toUpperCase();
    const action = await findActionId(actionId);
    if (!action || action.guildId !== guildId) throw new Error('Action ID not found.');

    const modLog = await findModLogByActionId(guildId, actionId);
    if (!modLog) throw new Error('Mod-log message not found for this action.');

    const channel = await client.channels.fetch(modLog.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) throw new Error('Mod-log channel is unavailable.');
    const message = await channel.messages.fetch(modLog.messageId).catch(() => null);
    if (!message?.embeds[0]) throw new Error('Mod-log message is unavailable.');

    const current = message.embeds[0];
    const title = (current.title || 'A moderation action').replace(
        /^\[(?:PENDING APPEAL|REVOKED|APPEAL APPROVED)\]\s*/i,
        '',
    );
    await message.edit({
        embeds: [EmbedBuilder.from(current).setTitle(`[PENDING APPEAL] ${title}`)],
    });

    if (!modLog.threadId) throw new Error('Mod-log discussion thread is unavailable.');
    const thread = await client.channels.fetch(modLog.threadId).catch(() => null);
    if (!thread?.isTextBased() || thread.isDMBased()) throw new Error('Mod-log discussion thread is unavailable.');
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
