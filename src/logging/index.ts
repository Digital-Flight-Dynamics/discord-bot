import { ClientEvents } from 'discord.js';
import { channelCreate, channelDelete, channelUpdate } from './ChannelLogs';
import { startEmojiLogs } from './EmojiLogs';
import { startMessageLogs } from './MessageLogs';
import { startModLogs } from './ModLogs';
import { startRoleLogs } from './RoleLogs';

export interface LogDefinition<T extends [...any]> {
    event: keyof ClientEvents;
    execute: (...args: T) => void;
}

export default [channelCreate, channelDelete, channelUpdate];
