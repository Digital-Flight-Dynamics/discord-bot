import { CommandDefinition, createErrorEmbed } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

const argToSec = (arg: string): number => {
    if (!arg) return 0;

    const num = parseInt(arg.slice(0, -1));
    if (isNaN(num)) return 0;

    if (arg.endsWith('s')) return num;
    if (arg.endsWith('m')) return num * 60;
    if (arg.endsWith('h')) return num * 60 * 60;
    if (arg.endsWith('d')) return num * 60 * 60 * 24;

    return 0;
};

export const ban: CommandDefinition = {
    names: ['ban'],
    description: 'Bans the mentioned user. `Arguments: <id> <delete_msg_time> <reason>`',
    category: CommandCategories.MODERATION,
    permissions: ['BanMembers'],
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
            await message.channel.send({ embeds: [createErrorEmbed('You cannot ban yourself')] }).catch(console.error);
            return;
        }

        let error = false;
        const member = await message.guild.members.fetch(id).catch((err) => {
            console.error(err);
            const errString = err.toString();
            if (errString.includes('Unknown User') || errString.includes('Invalid Form Body')) {
                error = true;
            }
        });
        if (error) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        const msgDeleteSecs = argToSec(args[1]);
        const reason = (msgDeleteSecs === 0 ? args.slice(1).join(' ') : args.slice(2).join(' ')) || 'None';

        // don't immediately return if member is not found, because we want to be able to ban users who aren't in the server
        if (member) {
            if (!member.bannable) {
                await message.channel.send({ embeds: [createErrorEmbed('I cannot ban this user')] }).catch(console.error);
                return;
            }

            const dmEmbed = createEmbed({
                title: `Banned from ${message.guild.name}`,
                fields: [
                    { name: 'Reason', value: `${reason}`, inline: true },
                    { name: 'Moderator', value: `${message.author.tag}`, inline: true },
                ],
            });
            await member.send({ embeds: [dmEmbed] }).catch(console.error);
        }

        await message.guild.members.ban(id, { deleteMessageSeconds: msgDeleteSecs, reason }).catch(console.error);

        const embed = createEmbed({
            title: 'Banned User',
            description: `<@${id}> has been banned.`,
            fields: [
                { name: 'Reason', value: `${reason}`, inline: true },
                { name: 'Message Delete Timeframe', value: `${msgDeleteSecs === 0 ? 'None' : args[1]}`, inline: true },
            ],
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
