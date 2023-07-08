import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../..';

export const dm: CommandDefinition = {
    names: ['dm'],
    description: 'Sends a DM to the mentioned user. Usage: `.dm @mention content` | `.dm id content`',
    category: CommandCategories.MODERATION,
    permissions: ['ManageMessages'],
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
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const member = await message.guild.members.fetch(id).catch(console.error);

        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const content = args.slice(1).join(' ');

        if (!content) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('Please enter a message to DM')],
                })
                .catch(console.error);
            return;
        }

        const dmEmbed = new Discord.EmbedBuilder().setColor(color).setTitle('Management Message').setDescription(content);
        await member.user
            .createDM()
            .then((dm) => dm.send({ embeds: [dmEmbed] }))
            .catch(console.error);

        const embed = new Discord.EmbedBuilder()
            .setColor(color)
            .setTitle('Direct Messaged User')
            .setDescription(`DM sent to <@${id}>`)
            .addFields({ name: 'Content', value: `${content}` });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
