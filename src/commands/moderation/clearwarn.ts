import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import Warn from '../../schemas/warn';

export const clearwarn: CommandDefinition = {
    names: ['clearwarn'],
    description: 'Clears a warn the user has with the specified index (1-indexed). `Arguments: <id> <index>`',
    category: CommandCategories.MODERATION,
    permissions: ['ModerateMembers'],
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

        if (id === message.author.id) {
            await message.channel.send({ embeds: [createErrorEmbed('You cannot clear your own warns')] }).catch(console.error);
            return;
        }

        const member = await message.guild.members.fetch(id).catch(console.error);
        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const warnIndex = parseInt(args[1]);

        if (isNaN(warnIndex)) {
            await message.channel.send({ embeds: [createErrorEmbed('Invalid index')] }).catch(console.error);
            return;
        }

        // Check from the database how many warns the user has
        let warnProfile = await Warn.find({ userId: id }).catch(console.error);
        if (!warnProfile) {
            await message.channel.send({ embeds: [createErrorEmbed('Error when searching database')] }).catch(console.error);
            return;
        }
        const warnCount = warnProfile.length;
        warnProfile = warnProfile.filter((warn) => warn.warnIndex === warnIndex);

        if (warnIndex < 1 || warnIndex > warnCount) {
            await message.channel.send({ embeds: [createErrorEmbed('Invalid index, or user does not have any warns')] }).catch(console.error);
            return;
        }

        // Clear the warn
        await Warn.deleteOne({ warnIndex, userId: id }).catch(console.error);

        // Update the warn indexes
        await Warn.updateMany({ userId: id, warnIndex: { $gt: warnIndex } }, { $inc: { warnIndex: -1 } }).catch(console.error);

        const embed = createEmbed({
            title: `Cleared Warn ${warnIndex}`,
            description: `<@${id}>`,
            fields: [
                { name: 'Reason', value: `${warnProfile[0].reason}`, inline: true },
                { name: 'Moderator', value: `<@${warnProfile[0].moderatorId}>`, inline: true },
                { name: 'Action Taken', value: `${warnProfile[0].actionTaken ?? 'None'}`, inline: true },
                { name: 'Updated Warn Count', value: `${warnCount - 1}`, inline: false },
            ],
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
