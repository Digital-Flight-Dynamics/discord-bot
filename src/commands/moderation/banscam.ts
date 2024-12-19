export const banscam: CommandDefinition = {
    names: ['banscam'],
    description: 'Bans the mentioned user using the scam message template. `Arguments: <id>`',
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

        const msgDeleteSecs = '86400';
        const reason = 'Scam Messages / Compromised Account';

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
                    { name: 'Appeal', value: 'Should you recover your account and wish to appeal your ban, please reach out to us.'},
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
            ],
        });
        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
