import { CommandDefinition } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

export const liveries: CommandDefinition = {
    names: ['liveries', 'livery'],
    description: 'What liveries will be included in the A350X?',
    category: CommandCategories.A350X,
    execute: async (message) => {
        const embed = createEmbed({
            title: 'What liveries will be included?',
            description:
                'Upon release, the A350X will include a custom DFD livery, the Airbus house liveries, and a select few airlines. ' +
                "Other airline liveries can be made by the community, and they'll likely be available " +
                'via [flightsim.to](https://www.flightsim.to). ' +
                'The custom DFD livery will not be made by us, but rather it will be designed by the community. ' +
                'Sometime before release, we will be hosting a livery design competition, ' +
                'in which the highest rated design will be chosen.',
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
