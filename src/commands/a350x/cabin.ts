import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const cabin: CommandDefinition = {
    names: ['cabin'],
    description: 'Informs others about our plans for the A350X cabin',
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Will there be a cabin?')
            .setDescription(
                'Yes, of course! There will be a detailed passenger cabin modeled for the A350X. ' +
                    'However, as of now, we only plan on developing a generic cabin 3D model. This is due to the varied cabin layouts that airlines have.',
            );

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
