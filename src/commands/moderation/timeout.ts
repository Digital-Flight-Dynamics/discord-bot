import { CommandDefinition, createErrorEmbed } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

const argToMs = (arg: string): number => {
    if (!arg) return 0;

    const num = parseInt(arg.slice(0, -1));
    if (isNaN(num)) return 0;

    if (arg.endsWith('s')) return num * 1000;
    if (arg.endsWith('m')) return num * 1000 * 60;
    if (arg.endsWith('h')) return num * 1000 * 60 * 60;
    if (arg.endsWith('d')) return num * 1000 * 60 * 60 * 24;
    if (arg.endsWith('w')) return num * 1000 * 60 * 60 * 24 * 7;

    return 0;
};

export const timeout: CommandDefinition = {
    names: ['timeout'],
    description: 'Timeouts the mentioned user. `Arguments: <id> <duration> <reason>`',
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
            await message.channel.send({ embeds: [createErrorEmbed('You cannot timeout yourself')] }).catch(console.error);
            return;
        }

        // find member in server
        const member = await message.guild.members.fetch(id).catch(console.error);
        if (!member) {
            await message.channel.send({ embeds: [invalidEmbed] }).catch(console.error);
            return;
        }

        if (!member.manageable) {
            await message.channel.send({ embeds: [createErrorEmbed('I cannot timeout this user')] }).catch(console.error);
            return;
        }

        const duration = argToMs(args[1]);
        if (duration === 0) {
            await message.channel.send({ embeds: [createErrorEmbed('Please enter a valid duration')] }).catch(console.error);
            return;
        }

        const reason = args.slice(2).join(' ') || 'None';

        const dmEmbed = createEmbed({
            title: `Timeout in ${message.guild.name}`,
            fields: [
                { name: 'Duration', value: args[1], inline: true },
                { name: 'Reason', value: `${reason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}` },
            ],
        });

        await member.timeout(duration, reason).catch(console.error);
        await member.send({ embeds: [dmEmbed] }).catch(console.error);

        const embed = createEmbed({
            title: 'Put User in Timeout',
            description: `<@${id}> has been put in timeout.`,
            fields: [
                { name: 'Duration', value: args[1], inline: true },
                { name: 'Reason', value: `${reason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}` },
            ],
        });

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
