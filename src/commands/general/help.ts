module.exports = {
    name: 'help',
    async execute(message, args, config, client, Discord) {
        let category = args[0];

        if (!category) {
            const rootEmbed = new Discord.MessageEmbed()
                .setColor(config.embedColor)
                .setTitle('Command Categories')
                .addFields(
                    { name: 'A35X', value: 'Commands related to the A35X project' },
                    { name: 'General', value: 'Generic commands' },
                    { name: 'Moderation', value: 'Commands used by staff' },
                    { name: 'Fun', value: 'Fun commands' },
                );
            await message.channel.send({ embeds: [rootEmbed] });

            return;
        }

        category = category.toLowerCase();

        const embed = new Discord.MessageEmbed().setColor(config.embedColor).setTitle(`${category}`);

        if (category === 'a35x') {
            embed.addFields(
                { name: '.marketplace', value: 'Will the A35X come to the MSFS Marketplace or Xbox?' },
                { name: '.when', value: 'When is the A35X coming?' },
            );
        } else if (category === 'general') {
            embed.addFields(
                { name: '.membercount', value: 'Displays the amount of members in the server' },
                { name: '.metar', value: 'Shows the metar for the selected airport (first argument). e.g. `.metar EGLL`' },
            );
        } else if (category === 'moderation') {
            embed.addFields(
                { name: '.ban', value: 'Bans the mentioned user' },
                { name: '.dm', value: 'Sends a DM to the mentioned user' },
                { name: '.kick', value: 'Kicks the mentioned user' },
                { name: '.purge', value: 'Clears the specified amount of messages' },
                { name: '.whois', value: 'Gives information about the mentioned user' },
            );
        } else if (category === 'fun') {
            embed.addFields({ name: '.fun', value: 'A placeholder fun command' });
        } else {
            return;
        }

        await message.channel.send({ embeds: [embed] });
    },
};
