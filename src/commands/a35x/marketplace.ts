module.exports = {
    name: 'marketplace',
    async execute(message, args, config, client, Discord) {
        const embed = new Discord.MessageEmbed()
            .setColor(config.embedColor)
            .setTitle('Will the A350X come to the MSFS Marketplace or Xbox?')
            .setDescription(
                'Microsoft requires marketplace/Xbox planes to be licensed. ' +
                    'This is not possible for freeware developers such as us due to the very high cost to obtain a license. ' +
                    'Large aircraft manufacturers, such as Airbus and Boeing, would typically ask for an amount somewhere in the tens of thousands, even if the project is non-profit. ' +
                    'Furthermore, Microsoft does not allow addons on the marketplace that use copyleft licenses such as GPL due to legal reasons.',
            )
            .setFooter('TL;DR: It will neither come to the marketplace, nor will it come to Xbox.');
        await message.channel.send({ embeds: [embed] });
    },
};
