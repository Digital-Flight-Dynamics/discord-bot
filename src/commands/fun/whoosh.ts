import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const whoosh: CommandDefinition = {
    names: ['whoosh'],
    description: "When you don't get the joke",
    category: CommandCategories.FUN,
    execute: async (message, args) => {
        const embed = new Discord.MessageEmbed().setColor(color).setImage('https://media.discordapp.net/attachments/649343789747535887/911738718262538311/unknown.png');

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
