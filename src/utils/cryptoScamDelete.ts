import Discord from 'discord.js';
import { UtilDefinition } from '.';

export const cryptoScamDelete: UtilDefinition = {
    event: 'messageCreate',
    execute: async (message: Discord.Message) => {
        if (message.channel.type === Discord.ChannelType.DM) return;
        const content = message.content.toLowerCase();

        // basic filter
        if (!content.includes('earn') || !content.includes('crypto market')) {
            return;
        }

        if (
            content.includes('https://') ||
            message.content.includes('WhatsApp') ||
            message.content.includes('Telegram') ||
            content.includes('commission') ||
            content.includes('direct message')
        ) {
            // 1 hour timeout & delete message
            message.guild.members.cache.get(message.author.id).timeout(3600000).catch(console.error);
            await message.delete().catch(console.error);
        }
    },
};
