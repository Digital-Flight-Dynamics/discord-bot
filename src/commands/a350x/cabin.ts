import { CommandDefinition } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

export const cabin: CommandDefinition = {
    names: ['cabin'],
    description: 'Informs others about our plans for the A350X cabin',
    category: CommandCategories.A350X,
    execute: async (message) => {
        const embed = createEmbed({
            title: 'Will there be a cabin?',
            description:
                'Yes, of course! There will be a detailed passenger cabin modeled for the A350X. ' +
                'However, as of now, we only plan on developing a generic cabin 3D model. This is due to the varied cabin layouts that airlines have.',
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
