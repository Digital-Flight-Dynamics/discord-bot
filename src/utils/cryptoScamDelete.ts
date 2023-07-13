import Discord from 'discord.js';
import { createWorker } from 'tesseract.js';
import { UtilDefinition } from '.';

export const cryptoScamDelete: UtilDefinition = {
    event: 'messageCreate',
    execute: async (message: Discord.Message) => {
        if (message.channel.type === Discord.ChannelType.DM) return;

        let content = message.content;
        const image = message.attachments.first();

        if (image) {
            try {
                const worker = await createWorker();
                await worker.loadLanguage('eng');
                await worker.initialize('eng');
                const {
                    data: { text },
                } = await worker.recognize(image.url);
                await worker.terminate();

                content += text;
            } catch (e) {
                console.error(e);
            }
        }

        const lowerCaseContent = content.toLowerCase();

        // basic filter
        if (!lowerCaseContent.includes('earn') || !(lowerCaseContent.includes('crypto') && lowerCaseContent.includes('market'))) {
            return;
        }

        if (
            lowerCaseContent.includes('https://') ||
            content.includes('WhatsApp') ||
            content.includes('Telegram') ||
            lowerCaseContent.includes('commission')
        ) {
            await message.delete().catch(console.error);
        }
    },
};
