module.exports = {
    name: 'dm',
    async execute(message, args, config, client, Discord) {
        if (!message.member.permissions.has('MANAGE_MESSAGES')) return;

        const user = message.mentions.users.first();

        if (!user) {
            await message.channel.send({ embeds: [new Discord.MessageEmbed().setColor(config.embedColor).setTitle('Error').setDescription('Please mention a valid user')] });
            return;
        }

        const content = args.slice(1).join(' ');

        const dmEmbed = new Discord.MessageEmbed().setColor(config.embedColor).setTitle('Digital Flight Dynamics').setDescription(content);
        await user.createDM().then((dm) => dm.send({ embeds: [dmEmbed] }));

        const embed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle('DM User')
            .setDescription(`DM sent to ${user}`)
            .addFields({ name: 'Content', value: `${content}` });
        message.channel.send({ embeds: [embed] });
    },
};
