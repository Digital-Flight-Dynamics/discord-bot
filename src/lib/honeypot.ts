import { Client, Message } from 'discord.js';
import { channels } from '../config';
import { createPendingModeration } from '../db/repositories/pendingModeration';
import { createEmbed, EmbedColors } from './embed';
import { executePendingModeration } from './moderationExecute';
import { tryDmUser } from './moderationNotify';

const HONEYPOT_PURGE_SECONDS = 2 * 60 * 60;
const HONEYPOT_TIMEOUT_MS = 60 * 1000;
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

    try {
        if (!client.user) throw new Error('Bot user is unavailable');

        const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
        await member
            ?.timeout(HONEYPOT_TIMEOUT_MS, 'Honeypot triggered; ban pending')
            .catch((err) => console.error(`[ERROR] Failed to apply honeypot safety timeout to ${message.author.id}:`, err));

        const dm = await tryDmUser(message.author, {
            embeds: [
                createEmbed(
                    {
                        color: EmbedColors.FAILURE,
                        title: `You are being removed from ${message.guild.name}`,
                        description: HONEYPOT_REASON,
                    },
                    true,
                ),
            ],
        });

        const pending = await createPendingModeration({
            guildId: message.guildId,
            actionType: 'ban',
            subjectUserId: message.author.id,
            moderatorUserId: client.user.id,
            reason: HONEYPOT_REASON,
            deleteMessageSeconds: HONEYPOT_PURGE_SECONDS,
            banType: 'hard',
            payload: { automation: 'Honeypot' },
        });
        await executePendingModeration(client, pending, { preActionDm: dm });
    } catch (err) {
        console.error(`[ERROR] Failed to process honeypot message from ${message.author.id}:`, err);
    } finally {
        processing.delete(key);
    }

    return true;
}
