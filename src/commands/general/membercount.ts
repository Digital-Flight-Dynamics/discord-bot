module.exports = {
    name: 'membercount',
    async execute(message, args, config, client, Discord) {
        const count = message.guild.memberCount;
        const areBots = message.guild.members.cache.map((member) => member.user.bot);

        let bots = 0;
        for (const b of areBots) {
            if (b) bots++;
        }

        const embed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle('Member Count')
            .addFields(
                { name: 'Total Members', value: `${count}` },
                { name: 'Users', value: `${count - bots}`, inline: true },
                { name: 'Bots', value: `${bots}`, inline: true },
            );

        await message.channel.send({ embeds: [embed] });
    },
};
