import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const variants: CommandDefinition = {
    names: ['variants'],
    description: 'Provides info on what variants will be developed',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('What variants will be developed?')
            .setDescription(
                'The first variant will be the -1000. The -900 and -900ULR will follow the release of the -1000 after some time. ' +
                    "As for the freighter, we may consider developing it once the A350F is officially in service. However, it's not guaranteed.",
            );

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
