import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const dm: CommandDefinition = {
    names: ['dm'],
    description: 'Sends a DM to the mentioned user. Usage: `.dm <@id> content` (Cannot DM users not in the server)',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_MESSAGES'],
    execute: async (message, args) => {
        const user = message.mentions.users.first();

        if (!user) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('Please mention a valid user')],
                })
                .catch((err) => console.error(err));
            return;
        }

        const content = args.slice(1).join(' ');

        if (!content) {
            await message.channel
                .send({
                    embeds: [new Discord.MessageEmbed().setColor('#FF0000').setTitle('Error').setDescription('Please enter a message to DM')],
                })
                .catch((err) => console.error(err));
            return;
        }

        const dmEmbed = new Discord.MessageEmbed().setColor(color).setTitle('Digital Flight Dynamics').setDescription(content);
        await user
            .createDM()
            .then((dm) => dm.send({ embeds: [dmEmbed] }))
            .catch((err) => console.error(err));

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('DM User')
            .setDescription(`DM sent to ${user}`)
            .addFields({ name: 'Content', value: `${content}` });
        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
