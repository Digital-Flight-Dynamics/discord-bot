import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../..';

export const whois: CommandDefinition = {
    names: ['whois', 'userinfo'],
    description: 'Displays information about the mentioned user. Usage: `.whois,userinfo <@id>` (Does not work for users not in the server)',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_NICKNAMES'],
    execute: async (message, args) => {
        let user = message.mentions.users.first();

        if (!user) {
            user = message.author;
        }

        const member = message.guild.members.cache.get(user.id);
        const joined = member.joinedAt.toString().split(' ');
        const registered = user.createdAt.toString().split(' ');

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setAuthor(user.tag, user.avatarURL())
            .setDescription(`${user}`)
            .setThumbnail(user.avatarURL())
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
            .setFooter(`ID: ${user.id}`);
        await message.channel.send({ embeds: [embed] }).catch((err) => console.error(err));
    },
};
