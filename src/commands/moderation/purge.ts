module.exports = {
    name: 'purge',
    async execute(message, args, config, client, Discord) {
        if (!message.member.permissions.has('MANAGE_MESSAGES')) return;

        const amount = args[0];

        if (!amount || isNaN(amount)) {
            await message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor(config.embedColor)
                        .setTitle('Error')
                        .setDescription('Please enter a valid number'),
                ],
            });
            return;
        } else if (amount > 100) {
            await message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor(config.embedColor)
                        .setTitle('Error')
                        .setDescription('Please enter a number less than or equal to 100'),
                ],
            });
            return;
        } else if (amount < 1) {
            await message.channel.send({
                embeds: [
                    new Discord.MessageEmbed()
                        .setColor(config.embedColor)
                        .setTitle('Error')
                        .setDescription('Please enter a number greater than 0'),
                ],
            });
            return;
        }

        await message.channel.messages.fetch({ limit: amount }).then((msgs) => message.channel.bulkDelete(msgs));

        const embed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle('Purge Messages')
            .setDescription(`${amount} message(s) have been deleted`);
        await message.channel.send({ embeds: [embed] }).then((msg) => {
            setTimeout(() => {
                msg.delete().catch();
            }, 3000);
        });
    },
};
