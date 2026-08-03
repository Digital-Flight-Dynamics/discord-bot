import { Client } from 'discord.js';
import {
    claimModLogThreadDeleted,
    findModLogByMessageId,
    findModLogByThreadId,
    markModLogMessageDeleted,
} from '../db/repositories/modLogMessages';
import {
    findActionNotificationByMessageId,
    markActionNotificationFailed,
} from '../db/repositories/moderationActionNotifications';
import type { ModLogMessage } from '../db/schema';
import { atcUrl, modPortalUrl } from './moderationFormat';

export function registerModerationMessageTracker(client: Client): void {
    client.on('messageDelete', (message) => {
        if (message.author && message.author.id !== client.user?.id) return;
        void trackDeletedMessage(message.id).catch((err) =>
            console.error('[ERROR] Failed to track deleted moderation message:', err),
        );
    });

    client.on('threadDelete', (thread) => {
        void trackDeletedThread(client, thread.id).catch((err) =>
            console.error('[ERROR] Failed to track deleted moderation thread:', err),
        );
    });
}

async function trackDeletedMessage(messageId: string): Promise<void> {
    const [modLog, notification] = await Promise.all([
        findModLogByMessageId(messageId),
        findActionNotificationByMessageId(messageId),
    ]);
    if (modLog) await markModLogMessageDeleted(modLog.id);
    if (notification) {
        await markActionNotificationFailed(notification.id, 'User DM message was deleted or is unavailable.');
    }
}

async function trackDeletedThread(client: Client, threadId: string): Promise<void> {
    const modLog = await findModLogByThreadId(threadId);
    if (modLog) await handleDeletedModLogThread(client, modLog);
}

export async function handleDeletedModLogThread(client: Client, modLog: ModLogMessage): Promise<void> {
    if (modLog.threadDeleted || !(await claimModLogThreadDeleted(modLog.id))) return;
    if (modLog.messageDeleted) {
        return;
    }

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

    const url = modLog.actionId ? modPortalUrl(modLog.actionId) : atcUrl();
    await message
        .reply({ content: `Thread was deleted. Logs only available on [ATC](${url})` })
        .catch(() => undefined);
}
