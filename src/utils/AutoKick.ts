module.exports = async (message) => {
    if (message.content.includes('@everyone') && !message.member.permissions.has('MENTION_EVERYONE')) {
        const member = message.guild.members.cache.get(message.author.id);

        await message.delete();

        const blacklist = [
            'csgo',
            'cs:go',
            'cs go',
            'steam',
            'stearn',
            'kinfe',
            'knife',
            'skins',
            'giveaway',
            'free',
            'nitro',
            'discord',
            'discorcl',
        ];

        const dmEmbed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle(`Kicked from ${message.guild.name}`)
            .addFields(
                { name: 'Reason', value: 'Kicked as a precaution - potential scam', inline: true },
                { name: 'Moderator', value: 'Automated Ban', inline: true },
            );

        for (const word of blacklist) {
            if (message.content.includes(word)) {
                await member.user.send({ embeds: [dmEmbed] });
                await member.kick();
            }
        }
    }
};
