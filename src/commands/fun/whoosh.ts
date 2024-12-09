import { CommandDefinition } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

export const whoosh: CommandDefinition = {
    names: ['whoosh'],
    description: "When you don't get the joke",
    category: CommandCategories.FUN,
    execute: async (message) => {
        const embed = createEmbed({ image: { url: 'https://media.discordapp.net/attachments/649343789747535887/911738718262538311/unknown.png' } });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
