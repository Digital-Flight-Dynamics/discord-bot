import Discord from 'discord.js';
import { CommandCategories, CommandDefinition } from '../index';
import { color } from '../../index';

export const reactionroles: CommandDefinition = {
    names: ['reactionroles', 'rr'],
    description: 'Sends the reaction roles embed',
    category: CommandCategories.MODERATION,
    permissions: ['MANAGE_GUILD'],
    execute: async (message, args) => {
        const announcementsEmoji = '📣';
        const progressEmoji = '❕';
        const eventsEmoji = '✈';

        const embed = new Discord.MessageEmbed()
            .setColor(color)
            .setTitle('Announcement Roles')
            .setDescription(
                'React with the emojis to recieve the roles associated to them.\n\n' +
                    'Server Announcements - :mega:\n' +
                    'Progress Updates - :grey_exclamation:\n' +
                    'Event Announcements - :airplane:\n\n' +
                    "If you're interested in working with us as a programmer, 3D modeler, texturer, painter, or moderator, " +
                    'you can apply using this application form: https://forms.gle/LigLwWizG5Etz3KeA',
            );

        const rrMessage = await message.channel.send({ embeds: [embed] }).catch(console.error);

        if (!rrMessage) return;

        await rrMessage.react(announcementsEmoji);
        await rrMessage.react(progressEmoji);
        await rrMessage.react(eventsEmoji);
    },
};
