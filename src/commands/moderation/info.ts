import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const info: CommandDefinition = {
    names: ['info'],
    description: 'Displays an embed with core information about the Discord server',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_GUILD'],
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Information')
            .setDescription(
                'Please read the rules before anything else.\n\n' +
                    'Go to <#808791055184691211> to obtain announcement/update roles.\n\n' +
                    'If you are interested in working with us, please fill out this form: https://forms.gle/LigLwWizG5Etz3KeA',
            );

        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
