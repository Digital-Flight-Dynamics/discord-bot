import { Client, Message } from 'discord.js';
import { channels } from '../config';
import { createPendingModeration } from '../db/repositories/pendingModeration';
import { executePendingModeration } from './moderationExecute';

const HONEYPOT_PURGE_SECONDS = 2 * 60 * 60;
const HONEYPOT_REASON =
    'You sent a message in our bot honeypot channel. Your account might be compromised. ' +
    'Change your passwords, log out of all sessions and remove all account connections. ' +
    'You have been removed from the server to prevent your account from spreading spam/scam messages. ' +
    'Once you have recovered your account, feel free to appeal.';

const processing = new Set<string>();

/** Soft-ban and create a normal moderation case for anyone posting in the honeypot channel. */
export async function handleHoneypotMessage(client: Client, message: Message): Promise<boolean> {
    if (!message.inGuild() || message.author.bot || message.channelId !== channels.honeypot) {
        return false;
    }

    const key = `${message.guildId}:${message.author.id}`;
    if (processing.has(key)) return true;
    processing.add(key);

    try {
        if (!client.user) throw new Error('Bot user is unavailable');

        const pending = await createPendingModeration({
            guildId: message.guildId,
            actionType: 'ban',
            subjectUserId: message.author.id,
            moderatorUserId: client.user.id,
            reason: HONEYPOT_REASON,
            deleteMessageSeconds: HONEYPOT_PURGE_SECONDS,
            banType: 'soft',
        });
        await executePendingModeration(client, pending);
    } catch (err) {
        console.error(`[ERROR] Failed to process honeypot message from ${message.author.id}:`, err);
    } finally {
        processing.delete(key);
    }

    return true;
}
