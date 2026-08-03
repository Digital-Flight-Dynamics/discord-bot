import { CommandCategories, CommandDefinition } from '../definitions';
import { createEmbed } from '../../lib/embed';
import { channels } from '../../config';

export const info: CommandDefinition = {
    names: ['info'],
    description: 'Displays an embed with core information about the Discord server',
    category: CommandCategories.MODERATION,
    requiredRoleGroup: 'moderation',
    execute: async (message) => {
        const embed = createEmbed({
            title: 'Information',
            description:
                'Please read the rules before anything else.\n\n' +
                `Go to <#${channels.roles}> to obtain announcement/update roles.\n\n` +
                'If you are interested in working with us, please fill out this form: https://forms.gle/LigLwWizG5Etz3KeA',
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
