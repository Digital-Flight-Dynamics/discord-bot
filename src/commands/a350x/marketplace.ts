import { CommandCategories, CommandDefinition } from '../index';
import { createEmbed } from '../../lib/embed';

export const marketplace: CommandDefinition = {
    names: ['marketplace', 'xbox'],
    description: "Explains why the A350X won't be coming to the MSFS marketplace",
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = createEmbed({
            title: 'Will the A350X come to the MSFS Marketplace or Xbox?',
            description:
                'Microsoft does not allow Marketplace/Xbox addons to have copyleft licenses due to legal reasons. ' +
                'Being committed freeware open sourced developers, we wish to remain under the GNU GPL license for our aircraft. ' +
                'However, it is also not possible to maintain 2 seperate versions for legal and practicability reasons. ' +
                'Furthermore, our addon could potentially run certain applications outside of the simulator, which would not be ' +
                'possible within the scope of the marketplace.',
            footer: { text: 'TL;DR: It will neither come to the marketplace, nor will it come to Xbox.' },
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
