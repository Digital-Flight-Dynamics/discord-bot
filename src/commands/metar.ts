const XMLHttpRequest = require('xhr2');

module.exports = {
    name: 'metar',
    async execute(message, args, config, client, Discord) {
        const icao = args[0];

        if (!icao) {
            await message.channel.send({
                embeds: [
                    new Discord.MessageEmbed().setColor(config.embedColor).setTitle('Error').setDescription('Please enter an ICAO code'),
                ],
            });
            return;
        }

        const http = new XMLHttpRequest();
        const url = `http://tgftp.nws.noaa.gov/data/observations/metar/decoded/${icao.toUpperCase()}.TXT`;
        http.open('GET', url);
        http.send();

        http.onreadystatechange = async function () {
            if (this.readyState === 4) {
                const metarData = http.responseText;

                if (metarData.includes('<h1>Not Found</h1>')) {
                    await message.channel.send({
                        embeds: [
                            new Discord.MessageEmbed()
                                .setColor(config.embedColor)
                                .setTitle('Error')
                                .setDescription('Please enter a valid ICAO code'),
                        ],
                    });
                    return;
                }

                const embed = new Discord.MessageEmbed()
                    .setColor(config.embedColor)
                    .setTitle(`METAR for ${icao.toUpperCase()}`)
                    .setDescription(metarData);

                await message.channel.send({ embeds: [embed] });
            }
        };
    },
};
