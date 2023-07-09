import { CommandCategories, CommandDefinition } from '../index';
import { createEmbed } from '../../lib/embed';

export const EMBED = createEmbed({
    color: 0x18b1ab,
    title: 'When is the A350X coming?',
    description:
        'Since this is a freeware project, we do not impose deadlines on our volunteer developers. ' +
        'We value a high-quality release over an incomplete rapid publication. ' +
        'Our developers are working hard to build the A350X addon as good and feature-complete as possible. ' +
        'However, we cannot provide a release date or estimate for the reasons stated above.',
});

export const when: CommandDefinition = {
    names: ['when'],
    description: "Explains how we don't know when the A350X will release",
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        await message.channel.send({ embeds: [EMBED] }).catch(console.error);
    },
};
