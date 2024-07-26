import { ClientEvents, TextChannel } from 'discord.js';
import { channelCreate, channelDelete, channelUpdate } from './ChannelLogs';
import { emojiCreate, emojiDelete, emojiUpdate } from './EmojiLogs';
import { messageDelete, messageDeleteBulk, messageUpdate } from './MessageLogs';
import { guildBanAdd, guildBanRemove } from './BanLogs';
import { roleCreate, roleDelete, roleUpdate } from './RoleLogs';

export interface LogDefinition {
    event: keyof ClientEvents;
    execute: (...args: unknown[]) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getLogChannel = (guildProperty: any) => {
    return guildProperty.guild.channels.cache.find((c) => c.name === 'logs') as TextChannel;
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
