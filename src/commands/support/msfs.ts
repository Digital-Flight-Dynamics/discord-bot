import { CommandCategories, CommandDefinition } from '../index';
import { createEmbed } from '../../lib/embed';

export const msfs: CommandDefinition = {
    names: ['msfs'],
    description: 'Redirects user to MSFS server for support',
    category: CommandCategories.SUPPORT,
    execute: async (message, args) => {
        const embed = createEmbed({
            title: 'Simulator Issue',
            description:
                'The issue you have described is something regarding Microsoft Flight Simulator. ' +
                'As this is the Digital Flight Dynamics A350X project server, we are unable to provide support for this. ' +
                "For such core simulator issues, we recommend you visit [Microsoft Flight Simulator's Discord](https://discord.gg/msfs) " +
                'or the official [Microsoft Flight Simulator Forum](https://forums.flightsimulator.com/c/community/140).',
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
