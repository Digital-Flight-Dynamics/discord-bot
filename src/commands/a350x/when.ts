import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export let whenedAvailable;

export const when: CommandDefinition = {
    names: ['when'],
    description: "Explains how we don't know when the A350X will release",
    category: CommandCategories.A350X,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('When is the A350X coming?')
            .setDescription(
                'Since this is a freeware project, we do not impose deadlines on our volunteer developers. ' +
                    'We value a high-quality release over an incomplete rapid publication. ' +
                    'Our developers are working hard to build the A350X addon as good and feature-complete as possible. ' +
                    'However, we cannot provide a release date or estimate for the reasons stated above.',
            );

        await message.channel.send({ embeds: [embed] }).catch(console.error);

        setWhenedAvailable(true);
    },
};

export const setWhenedAvailable = (avail: boolean) => {
    whenedAvailable = avail;
};
