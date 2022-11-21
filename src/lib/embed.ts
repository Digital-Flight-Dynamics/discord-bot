import { MessageEmbed, MessageEmbedOptions } from 'discord.js';
import { color } from '..';

export const createEmbed = (options: MessageEmbedOptions, timestamp?: boolean) => {
    const embed = new MessageEmbed({ color, ...options });
    if (timestamp) embed.setTimestamp();

    return embed;
};
