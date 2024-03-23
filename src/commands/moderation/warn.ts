import mongoose from 'mongoose';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';
import Warn from '../../schemas/warn';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

export const warn: CommandDefinition = {
    names: ['warn'],
    description: 'Warns the mentioned user, with the specified reason. `Arguments: <id> <reason>`',
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

        const newWarnCount = warnProfile.length + 1;

        const dmEmbed = createEmbed({
            title: `Warned in ${message.guild.name}`,
            fields: [
                { name: 'Reason', value: `${warnReason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
                { name: 'Warn Count', value: `${newWarnCount}`, inline: false },
            ],
        });

        await member.send({ embeds: [dmEmbed] }).catch(console.error);

        const embed = createEmbed({
            title: 'Warned User',
            description: `<@${id}> has been warned.`,
            fields: [
                { name: 'Reason', value: `${warnReason}`, inline: true },
                { name: 'Warn Count', value: `${newWarnCount}`, inline: true },
            ],
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);

        // Action prompt
        const actionEmbed = createEmbed({
            title: 'Action',
            description: 'Will there be any action taken against this user?',
        });

        // Yes or no buttons for if there will be further action taken
        const yes = new ButtonBuilder().setCustomId('warn_with_action').setLabel('Yes').setStyle(ButtonStyle.Danger);
        const no = new ButtonBuilder().setCustomId('warn_without_action').setLabel('No').setStyle(ButtonStyle.Success);
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(yes, no);

        // If yes selected, prompt for a brief description of the action
        const actionInput = new TextInputBuilder()
            .setCustomId('warn_action_input')
            .setLabel('Briefly describe the action')
            .setMaxLength(100)
            .setRequired(true)
            .setStyle(TextInputStyle.Short);
        const inputActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(actionInput);
        const inputModal = new ModalBuilder().setCustomId('input_modal').setTitle('Action Description').addComponents(inputActionRow);

        // Send the message with the buttons
        const actionMessage = await message.channel.send({ embeds: [actionEmbed], components: [buttonRow] }).catch(console.error);
        // Make typescript happy
        if (!actionMessage) return;

        let actionDescription = 'None';

        // Wait for the moderator to click a button
        const buttonInteraction = await actionMessage.awaitMessageComponent({ filter: (i) => i.user.id === message.author.id, time: 60_000 });

        if (buttonInteraction.customId === 'warn_with_action') {
            // Now prompt for details of the action
            await buttonInteraction.showModal(inputModal);
            const modalInteraction = await buttonInteraction.awaitModalSubmit({ time: 60_000 });

            // Fetch the action description then close the modal
            actionDescription = modalInteraction.fields.getTextInputValue('warn_action_input') || 'None';
            await modalInteraction.deferUpdate();

            // Delete the action message and send a new one with the action taken
            await actionMessage.delete().catch(console.error);
            const actionEmbed = createEmbed({
                title: 'Action',
                description: actionDescription,
            });
            await message.channel.send({ embeds: [actionEmbed] }).catch(console.error);
        } else {
            await actionMessage.delete().catch(console.error);
            await message.channel.send({ embeds: [createEmbed({ title: 'Action', description: 'No action taken.' })] }).catch(console.error);
        }

        // Finally, create a new warn document in the db
        const warn = await new Warn({
            _id: new mongoose.Types.ObjectId(),
            warnIndex: newWarnCount,
            userId: id,
            reason: warnReason,
            moderatorId: message.author.id,
            actionTaken: actionDescription,
            timestamp: new Date(),
        });
        await warn.save().catch(console.error);
    },
};
