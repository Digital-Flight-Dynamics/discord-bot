import axios from 'axios';
import { CommandCategories, CommandDefinition, createErrorEmbed } from '../index';
import { createEmbed } from '../../lib/embed';

export const taf: CommandDefinition = {
    names: ['taf'],
    description: 'Displays the TAF for the given airport.',
    category: CommandCategories.GENERAL,
    execute: async (message, args) => {
        const icao = args[0];

        if (!icao) {
            await message.channel.send({ embeds: [createErrorEmbed('Please provide an ICAO code')] }).catch(console.error);
            return;
        }

        let embed = undefined;
        let shouldReturn = false;

        await axios
            .get(`https://avwx.rest/api/taf/${icao}`, {
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

                const { raw, station } = report;

                embed = createEmbed(
                    {
                        title: `TAF for ${station}`,
                        fields: [
                            { name: 'Raw Report', value: `${raw}` },
                            {
                                name: 'Readable Report',
                                value: 'Coming soon',
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
