import Discord from 'discord.js';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { color } from '../..';

export const whois: CommandDefinition = {
    names: ['whois', 'userinfo'],
    description: 'Displays information about the given user. Usage: `.whois | .userinfo @mention` | `.whois | .userinfo id`',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_NICKNAMES'],
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
            id = message.author.id;
        }

        const member = await message.guild.members.fetch(id).catch(console.error);

        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const joined = member.joinedAt.toString().split(' ');
        const registered = member.user.createdAt.toString().split(' ');

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setAuthor(member.user.tag, member.user.avatarURL())
            .setDescription(`<@${id}>`)
            .setThumbnail(member.user.avatarURL())
            .addFields(
                {
                    name: 'Registered',
                    value: `${registered[0]}, ${registered[1]} ${registered[2]}, ${registered[3]} at ${registered[4]} GMT`,
                    inline: true,
                },
                {
                    name: 'Joined',
                    value: `${joined[0]}, ${joined[1]} ${joined[2]}, ${joined[3]} at ${joined[4]} GMT`,
                    inline: true,
                },
                { name: 'Nickname', value: member.nickname === null ? 'None' : `${member.nickname}` },
                { name: 'Role Count', value: `${member.roles.cache.size - 1}`, inline: true },
                { name: 'Highest Role', value: `${member.roles.highest}`, inline: true },
            )
            .setFooter(`ID: ${id}`);
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
