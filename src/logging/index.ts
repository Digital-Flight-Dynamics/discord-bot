import { ClientEvents } from 'discord.js';
import { channelCreate, channelDelete, channelUpdate } from './ChannelLogs';
import { emojiCreate, emojiDelete, emojiUpdate } from './EmojiLogs';
import { messageDelete, messageDeleteBulk, messageUpdate } from './MessageLogs';
import { guildBanAdd, guildBanRemove } from './BanLogs';
import { roleCreate, roleDelete, roleUpdate } from './RoleLogs';

export interface LogDefinition {
    event: keyof ClientEvents;
    execute: (...args: unknown[]) => void;
}

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
