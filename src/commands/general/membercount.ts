module.exports = {
    name: 'membercount',
    async execute(message, args, config, client, Discord) {
        const count = message.guild.memberCount;
        const embed = new Discord.MessageEmbed().setColor(config.embedColor).setTItle('Members').setDescription(`${count}`);

        await message.channel.send({ embeds: [embed] });
    },
};
