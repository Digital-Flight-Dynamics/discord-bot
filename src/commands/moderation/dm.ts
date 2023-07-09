import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';

export const dm: CommandDefinition = {
    names: ['dm'],
    description: 'Sends a DM to the mentioned user. `Arguments: <id> <message>`',
    category: CommandCategories.MODERATION,
    permissions: ['ManageMessages'],
    execute: async (message, args) => {
        const invalidEmbed = createErrorEmbed('Please provide a valid user/id');

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

        const content = args.slice(1).join(' ');

        if (!content) {
            await message.channel
                .send({
                    embeds: [createErrorEmbed('Please enter a message to DM')],
                })
                .catch(console.error);
            return;
        }

        const dmEmbed = createEmbed({ title: 'Management Message', description: content });
        await member.user
            .createDM()
            .then((dm) => dm.send({ embeds: [dmEmbed] }))
            .catch(console.error);

        const embed = createEmbed({
            title: 'Direct Messaged User',
            description: `DM sent to <@${id}>`,
            fields: [{ name: 'Content', value: `${content}` }],
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
