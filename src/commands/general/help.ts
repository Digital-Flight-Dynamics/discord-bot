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

        const embed = new Discord.MessageEmbed().setColor(config.embedColor);

        if (category === 'a35x') {
            embed
                .setTitle('A35X')
                .addFields(
                    { name: '.marketplace', value: 'Will the A35X come to the MSFS Marketplace or Xbox?' },
                    { name: '.when', value: 'When is the A35X coming?' },
                );
        } else if (category === 'general') {
            embed
                .setTitle('General')
                .addFields(
                    { name: '.membercount', value: 'Displays the amount of members in the server' },
                    { name: '.metar', value: 'Shows the metar for the selected airport (`.metar ICAO`)' },
                );
        } else if (category === 'moderation') {
            embed
                .setTitle('Moderation')
                .addFields(
                    { name: '.ban', value: 'Bans the mentioned user (`.ban <@id> ban reason here`)' },
                    { name: '.dm', value: 'Sends a DM to the mentioned user (`.dm <@id> dm message here`)' },
                    { name: '.kick', value: 'Kicks the mentioned user (`.kick <@id> kick reason here`)' },
                    { name: '.purge', value: 'Clears the specified amount of messages (`.purge amount`)' },
                    { name: '.whois', value: 'Gives information about the mentioned user (`.whois <@id>`)' },
                );
        } else if (category === 'fun') {
            embed.setTitle('Fun').addFields({ name: '.fun', value: 'A placeholder fun command' });
        } else {
            return;
        }

        await message.channel.send({ embeds: [embed] });
    },
};
