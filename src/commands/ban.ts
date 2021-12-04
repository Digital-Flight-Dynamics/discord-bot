module.exports = {
    name: 'ban',
    async execute(message, args, config, client, Discord) {
        if (!message.member.permissions.has('BAN_MEMBERS')) return;

        const user = message.mentions.users.first();

        if (!user) {
            await message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor(config.embedColor)
                        .setTitle('Error')
                        .setDescription('Please mention a valid user'),
                ],
            });
            return;
        }

        const member = message.guild.members.cache.get(user.id);

        const reason = args.slice(1).join(' ') || 'None';

        const dmEmbed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle(`Banned from ${message.guild.name}`)
            .addFields(
                { name: 'Reason', value: `${reason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
            );
        await user.send({ embeds: [dmEmbed] });

        await member.ban({ reason: [reason] });

        const embed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle('Ban User')
            .setDescription(`${user.tag} has been banned.`)
            .addFields(
                { name: 'Reason', value: `${reason}`, inline: true },
                { name: 'Moderator', value: `${message.author.tag}`, inline: true },
            );
        await message.channel.send({ embeds: [embed] });
    },
};
