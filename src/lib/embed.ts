import { EmbedBuilder, EmbedData } from 'discord.js';
import { color } from '..';

export const createEmbed = (options: EmbedData, timestamp?: boolean) => {
    const embed = new EmbedBuilder({ color, ...options });
    if (timestamp) embed.setTimestamp();
    return embed;
};
