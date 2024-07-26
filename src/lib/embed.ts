import { EmbedBuilder, EmbedData } from 'discord.js';
import { Colors } from '../constants';

export const createEmbed = (options: EmbedData, timestamp?: boolean) => {
    const embed = new EmbedBuilder({ color: Colors.DFD_CYAN, ...options });
    if (timestamp) embed.setTimestamp();
    return embed;
};
