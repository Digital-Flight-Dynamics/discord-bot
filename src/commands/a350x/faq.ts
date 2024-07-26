import { CommandDefinition } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

export const faq: CommandDefinition = {
    names: ['faq'],
    description: 'Displays an embed with FAQ for the A350X project',
    category: CommandCategories.A350X,
    permissions: ['ManageGuild'],
    execute: async (message) => {
        const embed = createEmbed({
            title: 'Frequently Asked Questions',
            description: 'This will hopefully answer most of your questions. If you have any other questions, you may ask in <#808791475206094928>',
            fields: [
                {
                    name: 'Q: When will the A350X release?',
                    value:
                        'A: It will release as an alpha version when all visuals are complete and when systems/avionics ' +
                        'are usable for normal operations.',
                },
                {
                    name: 'Q: Freeware or payware?',
                    value: 'A: The A350X addon will be completely freeware AND open-source!',
                },
                {
                    name: 'Q: Will it have a custom cockpit?',
                    value: 'A: Yes, this addon will have a highly accurate custom cockpit.',
                },
                {
                    name: 'Q: I want to help development of the project. Where can I start?',
                    value:
                        'A: You can apply to join the development team using [this form](https://forms.gle/LigLwWizG5Etz3KeA). ' +
                        "Once you've completed the application, our team will have a look at it!",
                },
                {
                    name: 'Q: I work on the A350 as a pilot/engineer/technician and I would like to help. Who should I contact?',
                    value: 'A: Please contact anyone from the <@&808792384112558100> team',
                },
            ],
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
