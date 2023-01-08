import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const liveries: CommandDefinition = {
    names: ['liveries', 'livery'],
    description: 'What liveries will be included in the A350X?',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('What liveries will be included?')
            .setDescription(
                'Upon release, the A350X will include liveries for all IRL A350 operators. Fictional liveries will not be made by ' +
                    "our painting team, but there's a high likelihood that other painters will create and upload them onto " +
                    '[flightsim.to](https://www.flightsim.to). For the default DFD livery, we will host a livery design competition, ' +
                    'in which the highest rated design will be chosen as the default livery.',
            );

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
