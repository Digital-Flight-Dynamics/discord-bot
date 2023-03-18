import * as tf from '@tensorflow/tfjs-node';
import metadata from './when_model/metadata.json';

// const WHITELIST = ['808791399251312670', '808791475206094928'];
const WHITELIST = ['927041203545976845'];

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
            .replaceAll(/[^\w\s]|_/g, '')
            .split(' ');

        let error = undefined;
        const sequence = inputText.map((word) => {
            const wordIndex = metadata.config.word_index[word];
            if (!wordIndex) {
                error = 'Word not found: ' + word;
            }
            return wordIndex;
        });

        if (error) {
            await message.channel.send(error).catch(console.error);
            return;
        }

        const paddedSequence = padSequences([sequence], 36);
        const input = tf.tensor2d(paddedSequence, [1, 36]);
        const prediction = (model.predict(input) as tf.Tensor).dataSync()[0];
        await message.channel.send('' + prediction).catch(console.error);
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
