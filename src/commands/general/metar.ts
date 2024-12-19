import axios from 'axios';
import { CommandDefinition, createErrorEmbed } from '../index';
import { CommandCategories } from '../../constants';
import { createEmbed } from '../../lib/embed';

export const metar: CommandDefinition = {
    names: ['metar'],
    description: 'Displays the METAR for the given airport.',
    category: CommandCategories.GENERAL,
    execute: async (message, args) => {
        const icao = args[0];

        if (!icao) {
            await message.channel.send({ embeds: [createErrorEmbed('Please provide an ICAO code')] }).catch(console.error);
            return;
        }

        const degToDir = (deg: number) => {
            const index = Math.round((deg % 360) / 22.5);
            const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N'];
            return dirs[index];
        };

        let embed = undefined;
        let shouldReturn = false;

        await axios
            .get(`https://avwx.rest/api/metar/${icao}`, {
                headers: {
                    Authorization: `BEARER ${process.env.AVWX_KEY}`,
                },
            })
            .then(async (response) => {
                const report = response.data;

                if (!report) {
                    await message.channel
                        .send({ embeds: [createErrorEmbed(`No station available at the moment near ${icao.toUpperCase()}`)] })
                        .catch(console.error);
                    shouldReturn = true;
                    return;
                }

                const { raw, station, units, visibility, temperature, dewpoint, altimeter, clouds } = report;
                const time = `${report.time.dt.replace('T', ' ')}`;

                const getCloudType = (type: string) => {
                    switch (type) {
                        case 'FEW':
                            return 'Few';
                        case 'SCT':
                            return 'Scattered';
                        case 'BKN':
                            return 'Broken';
                        case 'OVC':
                            return 'Overcast';
                        case 'CB':
                            return 'Cumulonimbus';
                        case 'TCU':
                            return 'Towering cumulus';
                        default:
                            return 'error';
                    }
                };

                let cloudText = '';
                for (let i = 0; i < clouds.length; i++) {
                    if (i !== 0) cloudText += ', ';
                    const cloudType = getCloudType(clouds[i].type);
                    cloudText += `${cloudType} at ${clouds[i].altitude * 100}${units.altitude}`;
                }
                cloudText += clouds.length === 0 ? 'Clear skies' : ' - Reported AGL';

                let windVarText = '';
                const windVar = report.wind_variable_direction;
                if (windVar.length > 0) windVarText += `(variable ${windVar[0].value} to ${windVar[1].value})`;

                const wind = `${degToDir(report.wind_direction.value)}-${report.wind_direction.value} ${windVarText} at ${report.wind_speed.value}${
                    units.wind_speed
                }`;

                embed = createEmbed(
                    {
                        title: `METAR for ${station}`,
                        fields: [
                            { name: 'Raw Report', value: `${raw}` },
                            {
                                name: 'Readable Report',
                                value:
                                    `**Station:** ${station}\n` +
                                    `**Observed at:** ${time}\n` +
                                    `**Wind:** ${wind}\n` +
                                    `**Visibility:** ${visibility.value === 9999 ? '10km' : visibility.value + units.visibility}\n` +
                                    `**Temperature:** ${temperature.value}°${units.temperature}\n` +
                                    `**Dew Point:** ${dewpoint.value}°${units.temperature}\n` +
                                    `**Altimeter:** ${units.altimeter === 'inHg' ? altimeter.value.toFixed(2) : altimeter.value} ${units.altimeter}\n` +
                                    `**Clouds:** ${cloudText}\n` +
                                    `**Flight Rules:** ${report.flight_rules}`,
                            },
                        ],
                        footer: { text: 'Source: AVWX' },
                    },
                    true,
                );
            })
            .catch(async () => {
                await message.channel.send({ embeds: [createErrorEmbed('Please provide a valid ICAO code')] }).catch(console.error);
                shouldReturn = true;
            });

        if (shouldReturn) return;

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    },
};
