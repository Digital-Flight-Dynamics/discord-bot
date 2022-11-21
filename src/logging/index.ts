import { ClientEvents, TextChannel } from 'discord.js';
import { channelCreate, channelDelete, channelUpdate } from './ChannelLogs';
import { emojiCreate, emojiDelete, emojiUpdate } from './EmojiLogs';
import { messageDelete, messageDeleteBulk, messageUpdate } from './MessageLogs';
import { guildBanAdd, guildBanRemove } from './BanLogs';
import { roleCreate, roleDelete, roleUpdate } from './RoleLogs';

export enum Colors {
    RED = '#DD4400',
    ORANGE = '#FF8800',
    GREEN = '#00BB00',
}

export interface LogDefinition<T extends [...any]> {
    event: keyof ClientEvents;
    execute: (...args: T) => void;
}

export const getLogChannel = (guildProperty: any) => {
    return guildProperty.guild.channels.cache.find((c) => c.name === 'logs') as TextChannel;
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
