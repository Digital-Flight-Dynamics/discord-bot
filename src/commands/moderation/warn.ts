import mongoose from 'mongoose';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import Warn from '../../schemas/warn';

export const warn: CommandDefinition = {
    names: ['warn'],
    description: 'Warns the mentioned user, with the specified reason. `Arguments: <id> <reason>`',
    category: CommandCategories.MODERATION,
    permissions: ['KickMembers'],
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
            await message.channel.send({ embeds: [createErrorEmbed('You cannot warn yourself')] }).catch(console.error);
            return;
        }

        const member = await message.guild.members.fetch(id).catch(console.error);
        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        // Easy way to check for valid permissions, even though it's not about warns specifically
        if (!member.kickable) {
            await message.channel.send({ embeds: [createErrorEmbed('I cannot warn this user')] }).catch(console.error);
            return;
        }

        const warnReason = args.slice(1).join(' ') || 'None';

        // Check from the database the user has been warned before
        const warnProfile = await Warn.find({ userId: id }).catch(console.error);
        if (!warnProfile) {
            await message.channel.send({ embeds: [createErrorEmbed('Error when searching database')] }).catch(console.error);
            return;
        }

        const warnCount = warnProfile.length;

        // Create a new warn document
        const warn = await new Warn({
            _id: new mongoose.Types.ObjectId(),
            userId: id,
            reason: warnReason,
            moderatorId: message.author.id,
        });
        await warn.save().catch(console.error);

        const dmEmbed = createEmbed({
            title: `Warned in ${message.guild.name}`,
            fields: [
                { name: 'Reason', value: `${warnReason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
                { name: 'Warn Count', value: `${warnCount + 1}`, inline: false },
            ],
        });

        await member.send({ embeds: [dmEmbed] }).catch(console.error);

        const embed = createEmbed({
            title: 'Warned User',
            description: `<@${id}> has been warned.`,
            fields: [
                { name: 'Reason', value: `${warnReason}`, inline: true },
                { name: 'Warn Count', value: `${warnCount + 1}`, inline: true },
            ],
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
