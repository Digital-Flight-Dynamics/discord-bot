import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const msfs: CommandDefinition = {
    names: ['msfs'],
    description: 'Redirects user to MSFS server for support',
    category: CommandCategories.SUPPORT,
    execute: async (message, args) => {
        const embed = new Discord.EmbedBuilder()
            .setColor(color)
            .setTitle('Sim Issue')
            .setDescription(
                'The issue you have described is something regarding Microsoft Flight Simulator. ' +
                    'As this is the Digital Flight Dynamics A350X Project server, We are unable to provide support for the same. ' +
                    "For such core simulator issues, we recommend you visit [Microsoft Flight Simulator's Discord](https://discord.gg/msfs) or the official [Microsoft Flight Simulator Forum](https://forums.flightsimulator.com/c/community/140).",
            );

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
