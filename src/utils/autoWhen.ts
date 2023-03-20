import Discord from 'discord.js';
import * as tf from '@tensorflow/tfjs-node';
import metadata from './when_model/tokenizer.json';
import { EMBED } from '../commands/a350x/when';

const WHITELIST = ['808791475206094928'];
const PRE_FILTER = [
    'it',
    '350',
    '35x',
    'plane',
    'aircraft',
    'addon',
    'mod',
    'update',
    'progress',
    'discover',
    'alpha',
    'beta',
    'bird',
    'beauty',
    'estim',
    'msfs',
    'mfs',
    'sim',
    'soon',
    'year',
    '2023',
    'this',
    'planned',
    'eta',
    'timeframe',
    'approx',
];
const MAX_LEN = 100;

export const autoWhen = {
    event: 'messageCreate',
    execute: async (message) => {
        if (message.channel.type === 'DM') return;
        if (message.author.bot) return;

        let whitelisted = false;
        for (const id of WHITELIST) {
            if (message.channel.id === id) {
                whitelisted = true;
            }
        }
        if (!whitelisted) return;

        const model = await tf.loadLayersModel('file://./src/utils/when_model/model.json');

        const inputText = message.content
            .trim()
            .toLowerCase()
            // eslint-disable-next-line no-useless-escape
            .replace(/[!\"#$%&()*+,\-./:;<=>?@\[\\\]^_`{|}~\t\n]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ');

        let passFilter = false;
        for (const word of PRE_FILTER) {
            for (const f of inputText) {
                if (f.indexOf(word) !== -1) passFilter = true;
            }
        }
        if (!passFilter) {
            return await console.log(`"${message.content}" did not pass filter`);
        }

        const invalidWords = [];
        const sequence = inputText.map((word) => {
            let wordIndex = metadata.config.word_index[word];
            if (!wordIndex) {
                wordIndex = 2;
                invalidWords.push(word);
            }
            return wordIndex;
        });

        if (invalidWords.length > 0) {
            console.log('New word(s): ' + invalidWords.join(', '));
        }

        const paddedSequence = padSequences([sequence], MAX_LEN);
        const input = tf.tensor2d(paddedSequence, [1, MAX_LEN]);
        const prediction = (model.predict(input) as tf.Tensor).dataSync()[0];
        if (prediction < 0.5) {
            return await console.log(`"${message.content}" resulted in ${(prediction * 100).toFixed(2)}%`);
        }

        const when = new Discord.MessageEmbed(EMBED);
        await message.reply({ embeds: [when.setFooter(`Confidence: ${(prediction * 100).toFixed(2)}%`)] }).catch(console.error);
    },
};

export function padSequences(sequences, maxLen, padding = 'post', truncating = 'pre', value = 0) {
    return sequences.map((seq) => {
        // Perform truncation.
        if (seq.length > maxLen) {
            if (truncating === 'pre') {
                seq.splice(0, seq.length - maxLen);
            } else {
                seq.splice(maxLen, seq.length - maxLen);
            }
        }

        // Perform padding.
        if (seq.length < maxLen) {
            const pad = [];
            for (let i = 0; i < maxLen - seq.length; ++i) {
                pad.push(value);
            }
            if (padding === 'pre') {
                seq = pad.concat(seq);
            } else {
                seq = seq.concat(pad);
            }
        }

        return seq;
    });
}
