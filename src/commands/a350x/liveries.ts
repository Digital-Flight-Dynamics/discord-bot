import { CommandCategories, CommandDefinition } from '../index';
import { createEmbed } from '../../lib/embed';

export const liveries: CommandDefinition = {
    names: ['liveries', 'livery'],
    description: 'What liveries will be included in the A350X?',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = createEmbed({
            title: 'What liveries will be included?',
            description:
                'Upon release, the A350X will include a custom DFD livery and the Airbus house liveries. ' +
                'Other airline liveries can be made by the community, and most will likely be available ' +
                'via [flightsim.to](https://www.flightsim.to). ' +
                'The custom DFD livery will not be made by us, but rather it will be designed by the community. ' +
                'Sometime before release, we will be hosting a livery design competition, ' +
                'in which the highest rated design will be chosen.',
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
