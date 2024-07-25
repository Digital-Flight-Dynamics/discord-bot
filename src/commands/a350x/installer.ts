import { CommandDefinition } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';


export const installer: CommandDefinition = {
    names: ['installer'],
    description: "Provides information about the installer setup",
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = createEmbed({
            title: 'How will the A350X be available?',
            description: 'Unless circumstances change, we plan on utilizing the FlyByWire installer to offer the A350X. ',
            footer: { text: 'The A350X has not released yet, therefore these plans may change prior to the initial release.' },
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
