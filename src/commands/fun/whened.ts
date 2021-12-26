import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const whened: CommandDefinition = {
    names: ['whened'],
    description: 'Laughs at the user that got the .when',
    category: CommandCategories.FUN,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed().setColor(color).setImage('https://media.discordapp.net/attachments/740722295009706034/907005439579914340/meme.png');

        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
