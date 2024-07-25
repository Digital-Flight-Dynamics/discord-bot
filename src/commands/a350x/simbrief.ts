import { CommandDefinition } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';


export const simbrief: CommandDefinition = {
    names: ['simbrief'],
    description: 'Provides details about the simbrief integration',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = createEmbed({
            title: 'Will there be a simbrief integration?',
            description: 'Yes! Simbrief will be available to use via the OIS (Onboard Information System).',
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
