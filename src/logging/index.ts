import { ClientEvents, TextChannel } from 'discord.js';
import { channelCreate, channelDelete, channelUpdate } from './ChannelLogs';
import { emojiCreate, emojiDelete, emojiUpdate } from './EmojiLogs';
import { startMessageLogs } from './MessageLogs';
import { startModLogs } from './ModLogs';
import { startRoleLogs } from './RoleLogs';

export enum Colors {
    RED = '#FF0000',
    ORANGE = '#FFAA00',
    GREEN = '#00FF00',
}

export interface LogDefinition<T extends [...any]> {
    event: keyof ClientEvents;
    execute: (...args: T) => void;
}

export const getLogChannel = (thing: any) => {
    return thing.guild.channels.cache.find((c) => c.name === 'logs') as TextChannel;
};

export default [channelCreate, channelDelete, channelUpdate, emojiCreate, emojiDelete, emojiUpdate];
