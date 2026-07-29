import {
    APIEmbedField,
    Client,
    Guild,
    Message,
    MessageCreateOptions,
    TextChannel,
    User,
} from 'discord.js';
import { createEmbed, EmbedColors } from './embed';
import { getModLogChannel } from '../logging';
import { createModLogMessage, findModLogByCase } from '../db/repositories/modLogMessages';
import type { ModCaseType } from '../db/schema';

export type DmResult = {
    sent: boolean;
    channelId?: string;
    messageId?: string;
    /** Short reason when not delivered */
    reason?: string;
};

export type ModLogPostResult = {
    channelId: string;
    messageId: string;
    threadId: string | null;
    dbId: string | null;
};

/**
 * Attempt to DM a user. Expected Discord 403s (closed DMs / no mutual guilds)
 * are returned as a result — not dumped as a stack trace.
 */
export async function tryDmUser(user: User, options: MessageCreateOptions): Promise<DmResult> {
    try {
        const message = await user.send(options);
        return { sent: true, channelId: message.channelId, messageId: message.id };
    } catch (err: unknown) {
        const code = typeof err === 'object' && err && 'code' in err ? Number((err as { code: number }).code) : undefined;
        // 50007 cannot send messages to this user; 50278 no mutual guilds
        if (code === 50007 || code === 50278) {
            return { sent: false, reason: 'DMs closed or no mutual guilds' };
        }
        const message = err instanceof Error ? err.message : String(err);
        console.error('[ERROR] Unexpected DM failure:', message);
        return { sent: false, reason: 'DM failed' };
    }
}

/** Emoji for confirmation embeds (title / description). */
export function dmStatusEmoji(dm: DmResult): string {
    return dm.sent ? '📬' : '📭';
}

/** Field for staff confirmation / log embeds. */
export function dmStatusField(dm: DmResult): APIEmbedField {
    return {
        name: 'DM',
        value: dm.sent
            ? `${dmStatusEmoji(dm)} Delivered`
            : `${dmStatusEmoji(dm)} Not delivered${dm.reason ? ` — ${dm.reason}` : ''}`,
        inline: true,
    };
}

/** Short line for embed descriptions. */
export function dmStatusLine(dm: DmResult): string {
    return dm.sent
        ? `${dmStatusEmoji(dm)} User was DMed`
        : `${dmStatusEmoji(dm)} User was **not** DMed${dm.reason ? ` (${dm.reason})` : ''}`;
}

/** Add a durable follow-up note to the case's existing moderation thread. */
export async function postModerationThreadNote(opts: {
    client: Client;
    caseType: ModCaseType;
    caseId: string;
    title: string;
    description: string;
}): Promise<void> {
    const modLog = await findModLogByCase(opts.caseType, opts.caseId);
    if (!modLog?.threadId || modLog.threadDeleted) return;
    const thread = await opts.client.channels.fetch(modLog.threadId).catch(() => null);
    if (!thread?.isTextBased() || thread.isDMBased()) return;
    await thread
        .send({ embeds: [createEmbed({ color: EmbedColors.WARNING, title: opts.title, description: opts.description })] })
        .catch((err) => console.error('[ERROR] Failed to post moderation thread note:', err));
}

function threadNameFor(opts: { actionId?: string | null; caseType: string; subjectTag?: string }): string {
    const subject = opts.subjectTag || 'Unknown user';
    return `${opts.actionId || opts.caseType} - ${subject}`.slice(0, 100);
}

/**
 * Post a moderation action to #mod-logs, open a discussion thread, and persist message/thread IDs.
 */
export async function logModerationAction(
    guild: Guild,
    opts: {
        title?: string;
        description?: string;
        fields?: APIEmbedField[];
        color?: number;
        moderatorTag?: string;
        moderatorId?: string;
        subjectUserId?: string;
        subjectTag?: string;
        caseType: ModCaseType;
        caseId?: string | null;
        /** Public Action ID (A26…) for display / registry links */
        actionId?: string | null;
        /** Extra content posted as the first message inside the thread */
        threadIntro?: string;
        /** e.g. mod portal URL shown in the description */
        footerUrl?: string;
    },
): Promise<ModLogPostResult | null> {
    const modChannel = getModLogChannel({ guild }) as TextChannel | undefined;
    if (!modChannel?.isTextBased() || modChannel.isDMBased() || modChannel.isThread()) {
        console.error('[ERROR] Could not find required channel `channels.modLogs`. Read DEVELOPMENT.md for details.');
        return null;
    }

    const embed = createEmbed(
        {
            color: opts.color ?? EmbedColors.WARNING,
            title: opts.title || `A user has been ${actionPastFromDescription(opts.description)}`,
            description: [
                opts.actionId ? `Action ID: \`${opts.actionId}\`` : null,
                opts.footerUrl ? `[View on ATC](${opts.footerUrl})` : null,
            ]
                .filter(Boolean)
                .join(' • ') || undefined,
            fields: opts.fields,
        },
        true,
    );

    let parentMessage: Message;
    try {
        parentMessage = await modChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('[ERROR] Failed to post mod log:', err);
        return null;
    }

    let threadId: string | null = null;
    try {
        const thread = await parentMessage.startThread({
            name: threadNameFor({ actionId: opts.actionId, caseType: opts.caseType, subjectTag: opts.subjectTag }),
            autoArchiveDuration: 10080,
            reason: `Mod case: ${opts.actionId || opts.caseType}${opts.caseId ? ` ${opts.caseId}` : ''}`,
        });
        threadId = thread.id;

        await thread.send({ content: opts.threadIntro || 'Action discussion thread' }).catch(console.error);
    } catch (err) {
        console.error('[ERROR] Failed to create mod-log thread:', err);
    }

    let dbId: string | null = null;
    try {
        const row = await createModLogMessage({
            guildId: guild.id,
            caseType: opts.caseType,
            caseId: opts.caseId ?? null,
            actionId: opts.actionId ?? null,
            channelId: modChannel.id,
            messageId: parentMessage.id,
            threadId,
            subjectUserId: opts.subjectUserId ?? null,
            moderatorUserId: opts.moderatorId ?? null,
        });
        dbId = row.id;
    } catch (err) {
        console.error('[ERROR] Failed to store mod log message id:', err);
    }

    return {
        channelId: modChannel.id,
        messageId: parentMessage.id,
        threadId,
        dbId,
    };
}

function actionPastFromDescription(description?: string): string {
    const match = description?.match(/has been \*\*([^*]+)\*\*/i);
    return match?.[1] || 'actioned';
}
