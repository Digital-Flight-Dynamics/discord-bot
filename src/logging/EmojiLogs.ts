import { createEmbed } from '../lib/embed';
import Discord from 'discord.js';
import { Colors, LogDefinition, getLogChannel } from '.';
import { GuildEmoji } from 'discord.js';

export const emojiCreate: LogDefinition<[GuildEmoji]> = {
    event: 'emojiCreate',
    execute: async (emoji) => {
        const logChannel = getLogChannel(emoji);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.GREEN,
                title: 'Emoji Created',
                description: `**Name:** ${emoji.name}\n**Animated:** ${emoji.animated}`,
                footer: { text: `Emoji ID: ${emoji.id}` },
            },
            true,
        );
        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const emojiDelete: LogDefinition<[GuildEmoji]> = {
    event: 'emojiDelete',
    execute: async (emoji) => {
        const logChannel = getLogChannel(emoji);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.RED,
                title: 'Emoji Deleted',
                description: `**Name:** ${emoji.name}\n**Animated:** ${emoji.animated}`,
                footer: { text: `Emoji ID: ${emoji.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const emojiUpdate: LogDefinition<[GuildEmoji, GuildEmoji]> = {
    event: 'emojiUpdate',
    execute: async (oldEmoji, newEmoji) => {
        const logChannel = getLogChannel(oldEmoji);
        if (!logChannel) return;

        if (oldEmoji.name === newEmoji.name) return;

        const embed = createEmbed(
            {
                color: Colors.ORANGE,
                title: 'Emoji Name Changed',
                description: `**Before:** ${oldEmoji.name}\n**After:** ${newEmoji.name}`,
                footer: { text: `Emoji ID: ${oldEmoji.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};
