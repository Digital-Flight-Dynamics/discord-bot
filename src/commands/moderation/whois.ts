import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';

export const whois: CommandDefinition = {
    names: ['whois', 'userinfo'],
    description: 'Displays information about the given user. `Arguments: <id>`',
    category: CommandCategories.MODERATION,
    permissions: ['ManageNicknames'],
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('Please provide a valid user/id for someone in this server');

        let id = args[0];
        if (!id) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        // in case of a mention
        if (id.startsWith('<@') && id.endsWith('>')) {
            id = id.slice(2, -1);
        }

        const member = await message.guild.members.fetch(id).catch(console.error);
        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const joined = member.joinedAt.toString().split(' ');
        const registered = member.user.createdAt.toString().split(' ');

        const embed = createEmbed({
            author: { name: member.user.tag, iconURL: member.user.avatarURL() },
            description: `<@${id}>`,
            thumbnail: { url: member.user.avatarURL() },
            fields: [
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
                { name: 'Nickname', value: member.nickname ? `${member.nickname}` : `None` },
                { name: 'Role Count', value: `${member.roles.cache.size - 1}`, inline: true },
                { name: 'Highest Role', value: `${member.roles.highest}`, inline: true },
            ],
            footer: { text: `ID: ${id}` },
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
