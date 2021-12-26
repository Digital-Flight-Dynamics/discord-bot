import Discord from 'discord.js';
import { startChannelLogs } from './ChannelLogs';
import { startEmojiLogs } from './EmojiLogs';
import { startMessageLogs } from './MessageLogs';
import { startModLogs } from './ModLogs';
import { startRoleLogs } from './RoleLogs';

export const createLogEmbed = (color, title, description, footer) =>
    // eslint-disable-next-line implicit-arrow-linebreak
    new Discord.MessageEmbed().setColor(color).setTitle(title).setDescription(description).setFooter(footer).setTimestamp();

export default [startChannelLogs, startEmojiLogs, startMessageLogs, startModLogs, startRoleLogs];
