import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const simbrief: CommandDefinition = {
    names: ['simbrief'],
    description: 'Tells you more about SimBrief integration.',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Will it feature SimBrief integration?')
            .setDescription(
                'Yes, we will use SimBrief integration for all aircraft Variants.'
            );

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
