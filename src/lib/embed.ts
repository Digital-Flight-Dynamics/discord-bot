import { MessageEmbed, MessageEmbedOptions } from 'discord.js';
import { color } from '..';

export const createEmbed = (options: MessageEmbedOptions) => new MessageEmbed({ color, ...options });
