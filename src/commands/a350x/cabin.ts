import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';


export const cabin: CommandDefinition = {
    names: ['cabin'],
    description: "Explains the development plan on the A350X",
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Does the project have a detailed cabin?')
            .setDescription(
                'Our team does their best to provide a high-quality and fucntioning cockpit. ' +
                    'This means a functioning EFB and other real systems ' +
                    'Feel free to leave a suggestion in <#808791599517663252>.',
            );

        await message.channel.send({ embeds: [embed] }).catch(console.error);

    },
};

