import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';

export const unban: CommandDefinition = {
    names: ['unban'],
    description: 'Unbans the mentioned user. `Arguments: <id>`',
    category: CommandCategories.MODERATION,
    permissions: ['BanMembers'],
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('This user is not banned, or you provided an invalid id');

        let id = args[0];
        if (!id) {
            await message.channel.send({ embeds: [createErrorEmbed('Please provide a valid user/id')] }).catch(console.error);
            return;
        }

        // in case of a mention
        if (id.startsWith('<@') && id.endsWith('>')) {
            id = id.slice(2, -1);
        }

        // fetch ban to get reason or see if the user is even banned
        const ban = await message.guild.bans.fetch(id).catch(console.error);
        if (!ban) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const reason = ban.reason || 'None';

        // attempt unban
        await message.guild.members.unban(id).catch(console.error);

        const embed = createEmbed({
            title: 'Unbanned User',
            description: `<@${id}> has been unbanned.`,
            fields: [{ name: 'Ban Reason', value: reason }],
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
