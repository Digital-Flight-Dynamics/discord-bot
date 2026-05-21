import { createEmbed } from '../../lib/embed';
import { CommandCategories, type CommandDefinition } from '../definitions';

export const tools: CommandDefinition = {
    names: ['devtools', 'tools'],
    description: 'Tools and languages used in the development of the A350X',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = createEmbed({
            title: 'A350X Development Tools',
            description:
                '**3D Models:** Blender\n' +
                '**Textures:** Substance Painter\n' +
                '**Avionics:** TypeScript, React, MSFS Avionics Framework\n' +
                '**Systems:** Rust',
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
