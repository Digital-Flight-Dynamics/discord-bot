import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../..';

export const dm: CommandDefinition = {
    names: ['dm'],
    description: 'Sends a DM to the mentioned user. Usage: `.dm <@id> content` (Cannot DM users not in the server)',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_MESSAGES'],
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('Please enter a valid user/id for someone in this server');

        const user = message.mentions.users.first();
        let id = undefined;

        if (user) {
            id = user.id;
        } else {
            id = args[0];
        }

        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch((err) => console.log(err));
            return;
        }

        const member = await message.guild.members.fetch(id).catch((err) => console.error(err));

        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch((err) => console.log(err));
            return;
        }

        const content = args.slice(1).join(' ');

        if (!content) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('Please enter a message to DM')],
                })
                .catch((err) => console.error(err));
            return;
        }

        const dmEmbed = new Discord.MessageEmbed().setColor(color).setTitle('Digital Flight Dynamics').setDescription(content);
        await member.user
            .createDM()
            .then((dm) => dm.send({ embeds: [dmEmbed] }))
            .catch((err) => console.error(err));

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('DM User')
            .setDescription(`DM sent to ${member.user}`)
            .addFields({ name: 'Content', value: `${content}` });
        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
