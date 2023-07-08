import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const simbrief: CommandDefinition = {
    names: ['simbrief'],
    description: 'Provides details about the simbrief integration',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = new Discord.EmbedBuilder()
            .setColor(color)
            .setTitle('Will there be a simbrief integration?')
            .setDescription('Yes! Simbrief will be available to use via the OIS (Onboard Information System).');

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
