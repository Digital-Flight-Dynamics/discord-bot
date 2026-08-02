import type { APIEmbedField, Guild, GuildMember, User } from 'discord.js';
import { channels } from '../config';
import { createModerationActionNotification } from '../db/repositories/moderationActionNotifications';
import { captureIdentitySnapshot } from '../db/repositories/snapshots';
import { createEmbed, EmbedColors } from './embed';
import {
    appealUrl,
    formatInfractionCountLine,
    formatModeratorBlock,
    formatOrdinal,
    formatUserInformationBlock,
    getInfractionCounts,
    notifiedLine,
} from './moderationFormat';
import { moderationTextForEmbed } from './moderationLimits';
import type { DmResult } from './moderationNotify';

const fieldValue = (value: string, actionId = 'unknown') => moderationTextForEmbed(value, actionId);

function discordTimestamp(date: Date): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}
function discordTimestampRelative(date: Date): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function rulesUrl(guild: Guild): string {
    return `https://discord.com/channels/${guild.id}/${channels.info}`;
}

export async function storeActionDm(opts: {
    guildId: string;
    actionId: string;
    recordType: string;
    recordUuid: string;
    userId: string;
    dm: DmResult;
}): Promise<void> {
    if (!opts.dm.sent || !opts.dm.channelId || !opts.dm.messageId) return;
    await createModerationActionNotification({
        guildId: opts.guildId,
        actionId: opts.actionId,
        recordType: opts.recordType,
        recordUuid: opts.recordUuid,
        kind: 'action-dm',
        userId: opts.userId,
        channelId: opts.dm.channelId,
        messageId: opts.dm.messageId,
    }).catch(console.error);
}

export function userActionDmEmbed(opts: {
    guild: Guild;
    color: number;
    actionPast: string;
    actionName: string;
    actionId: string;
    reason: string;
    expiresAt?: Date | null;
    infractionNumber: number;
}) {
    const fields: APIEmbedField[] = [
        { name: 'Reason', value: fieldValue(opts.reason, opts.actionId), inline: false },
    ];

    if (opts.expiresAt) {
        fields.push({
            name: 'Expires',
            value: `This ${opts.actionName} will expire at ${discordTimestamp(opts.expiresAt)}`,
            inline: false,
        });
    }

    fields.push(
        {
            name: 'Notice',
            value: fieldValue(
                `This is your **__${formatOrdinal(opts.infractionNumber)}__** ${opts.actionName} infraction. ` +
                    `Further infractions${opts.expiresAt ? ` before this ${opts.actionName} expires` : ''} ` +
                    `may result in removal from our community. It is recommended that you read our ` +
                    `[server rules](${rulesUrl(opts.guild)}).`,
            ),
            inline: false,
        },
        {
            name: 'Appeal',
            value: `You may be able to appeal this action. You can do so on our [appeals form here](${appealUrl(opts.actionId)}).`,
            inline: false,
        },
    );

    return createEmbed(
        {
            color: opts.color,
            title: `You have been ${opts.actionPast} in ${opts.guild.name}`,
            description: `**Action ID**: \`${opts.actionId}\``,
            fields,
        },
        true,
    );
}

export function timeoutUserDmEmbed(opts: {
    guild: Guild;
    actionId: string;
    reason: string;
    expiresAt: Date;
}) {
    return createEmbed(
        {
            color: EmbedColors.WARNING,
            title: `You have been timed out at ${opts.guild.name}`,
            description:
                `You will be able to join the discussion again in ${discordTimestampRelative(opts.expiresAt)}. ` +
                'In the meantime, maybe have a glass of water.',
            fields: [
                { name: 'Reason', value: fieldValue(opts.reason, opts.actionId), inline: false },
                {
                    name: 'Appeal',
                    value: `You may be able to appeal this action. You can do so on our [appeals form here](${appealUrl(opts.actionId)}).`,
                    inline: false,
                },
            ],
            footer: { text: `This action (${opts.actionId}) has been logged into your account record.` },
        },
        true,
    );
}

export function buildModLogFields(opts: {
    action: 'warning' | 'kick' | 'ban' | 'timeout';
    subjectMember: GuildMember | null;
    subjectUser: User;
    subjectSnap: Awaited<ReturnType<typeof captureIdentitySnapshot>>;
    moderatorMember: GuildMember | null;
    moderatorUser: User | null;
    moderatorSnap: Awaited<ReturnType<typeof captureIdentitySnapshot>>;
    counts: Awaited<ReturnType<typeof getInfractionCounts>>;
    thisNth: number;
    dm: DmResult;
    expiresAt?: Date | null;
    durationToken?: string | null;
    reason: string;
    privateNote?: string | null;
    /** Public Action ID */
    actionId: string;
    automation?: string | null;
}) {
    const fields = [
        {
            name: 'User Information',
            value: formatUserInformationBlock({
                member: opts.subjectMember,
                user: opts.subjectUser,
                snap: opts.subjectSnap,
            }),
            inline: false,
        },
        {
            name: 'Infraction Count',
            value: formatInfractionCountLine(opts.action, opts.counts, opts.thisNth),
            inline: false,
        },
        {
            name: 'Notified',
            value: notifiedLine(opts.dm.sent, opts.dm.reason),
            inline: true,
        },
        {
            name: 'Expiration',
            value: opts.expiresAt ? opts.expiresAt.toUTCString() : 'Never',
            inline: true,
        },
        {
            name: 'Moderator',
            value: opts.automation
                ? `Bot Automation (${opts.automation})`
                : formatModeratorBlock({
                      member: opts.moderatorMember,
                      user: opts.moderatorUser,
                      snap: opts.moderatorSnap,
                  }),
            inline: false,
        },
    ];

    if (opts.action === 'timeout' || opts.action === 'ban') {
        fields.push({
            name: 'Duration',
            value: opts.durationToken || (opts.expiresAt ? 'Temporary' : 'Permanent'),
            inline: true,
        });
    }

    fields.push(
        {
            name: 'Reason',
            value: moderationTextForEmbed(opts.reason, opts.actionId),
            inline: false,
        },
        {
            name: 'Private Note',
            value: moderationTextForEmbed(opts.privateNote, opts.actionId),
            inline: false,
        },
    );

    return fields;
}
