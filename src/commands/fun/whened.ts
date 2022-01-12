import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../../index';
import { whenedAvailable, setWhenedAvailable } from '../a350x/when';

export const whened: CommandDefinition = {
    names: ['whened'],
    description: 'Laughs at the user that got the .when',
    category: CommandCategories.FUN,
    execute: async (message, args) => {
        if (!whenedAvailable) {
            await message.channel.send({ embeds: [createErrorEmbed('You need to .when someone first')] });
            return;
        }

        const embed = new Discord.MessageEmbed().setColor(color).setImage('https://media.discordapp.net/attachments/740722295009706034/907005439579914340/meme.png');

        await message.channel.send({ embeds: [embed] }).catch(console.error);

        setWhenedAvailable(false);
    },
};
