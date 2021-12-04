module.exports = {
    name: 'when',
    async execute(message, args, config, client, Discord) {
        const embed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle('When is the A35X coming?')
            .setDescription(
                'Since this is a freeware project, we do not impose deadlines on our volunteer developers. We value a high-quality release over an incomplete rapid publication. Our developers are working hard to build the A35X addon as good and feature-complete as possible. However, we cannot provide a release date or estimate for the reasons stated above.',
            );
        await message.channel.send({ embeds: [embed] });
    },
};
