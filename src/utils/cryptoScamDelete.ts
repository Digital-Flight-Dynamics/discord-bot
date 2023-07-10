import Discord from 'discord.js';
import { UtilDefinition } from '.';

export const cryptoScamDelete: UtilDefinition = {
    event: 'messageCreate',
    execute: async (message: Discord.Message) => {
        if (message.channel.type === Discord.ChannelType.DM) return;

        const content = message.content.toLowerCase();
        if (content.includes('earn') && content.includes('crypto market')) {
            await message.delete().catch(console.error);
        }
    },
};
