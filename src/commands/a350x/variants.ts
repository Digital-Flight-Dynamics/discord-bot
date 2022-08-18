import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const variants: CommandDefinition = {
    names: ['variants'],
    description: 'Tells you what A350 variants will be made',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('What A350 variants will be made?')
            .setDescription(
                'We will make the A350-1000 and an A350-900 after that.' +
                    'However, we might also make an ULR variant and if the cargo variant comes out there might be a possibilty for that.',
            );

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
