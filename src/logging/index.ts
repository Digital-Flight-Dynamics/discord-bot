import { ClientEvents, TextChannel } from 'discord.js';
import { channelCreate, channelDelete, channelUpdate } from './ChannelLogs';
import { emojiCreate, emojiDelete, emojiUpdate } from './EmojiLogs';
import { messageDelete, messageDeleteBulk, messageUpdate } from './MessageLogs';
import { guildBanAdd, guildBanRemove } from './BanLogs';
import { roleCreate, roleDelete, roleUpdate } from './RoleLogs';

import { EmbedColors } from '../lib/embed';
import { channels } from '../config';

/** Log embed colors aligned with the global palette. */
export enum Colors {
    RED = EmbedColors.FAILURE,
    ORANGE = EmbedColors.WARNING,
    GREEN = EmbedColors.SUCCESS,
    BLUE = EmbedColors.DFD_BLUE,
    DARK = EmbedColors.PENDING,
}

export interface LogDefinition {
    event: keyof ClientEvents;
    execute: (...args: any[]) => void;
}

/** Audit log channel (messages, roles, channels, Discord ban events). */
export const getLogChannel = (guildProperty: any) => {
    const guild = guildProperty.guild;
    return (
        (guild.channels.cache.get(channels.logs) as TextChannel | undefined) ||
        (guild.channels.cache.find(
            (c: { name: string }) => c.name === 'audit-logs' || c.name === 'logs',
        ) as TextChannel | undefined)
    );
};

/** Punishment / case log channel (warns, kicks, bans, timeouts). */
export const getModLogChannel = (guildProperty: any) => {
    const guild = guildProperty.guild;
    return (
        (guild.channels.cache.get(channels.modLogs) as TextChannel | undefined) ||
        (guild.channels.cache.find((c: { name: string }) => c.name === 'mod-logs') as TextChannel | undefined)
    );
};

export const snakeToNorm = (str: string) => {
    return str
        .toLowerCase()
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

export default [
    channelCreate,
    channelDelete,
    channelUpdate,
    emojiCreate,
    emojiDelete,
    emojiUpdate,
    messageDelete,
    messageDeleteBulk,
    messageUpdate,
    guildBanAdd,
    guildBanRemove,
    roleCreate,
    roleDelete,
    roleUpdate,
];
