import Discord from 'discord.js';
import { startMessageLogs } from './MessageLogs';

export const createLogEmbed = (color, title, description, footer) =>
    // eslint-disable-next-line implicit-arrow-linebreak
    new Discord.MessageEmbed()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter(footer)
        .setTimestamp();

export default startMessageLogs;
