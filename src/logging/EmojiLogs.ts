import { GuildEmoji, TextChannel } from 'discord.js';
import { createEmbed } from '../lib/embed';
import { LogDefinition } from '.';
import { Channels, Colors } from '../constants';

export const emojiCreate: LogDefinition = {
    event: 'emojiCreate',
    execute: async (emoji: GuildEmoji) => {
        const logChannel = emoji.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.SUCCESS,
                title: 'Emoji Created',
                description: `**Name:** ${emoji.name}\n**Animated:** ${emoji.animated}`,
                footer: { text: `Emoji ID: ${emoji.id}` },
            },
            true,
        );
        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const emojiDelete: LogDefinition = {
    event: 'emojiDelete',
    execute: async (emoji: GuildEmoji) => {
        const logChannel = emoji.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.ERROR,
                title: 'Emoji Deleted',
                description: `**Name:** ${emoji.name}\n**Animated:** ${emoji.animated}`,
                footer: { text: `Emoji ID: ${emoji.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const emojiUpdate: LogDefinition = {
    event: 'emojiUpdate',
    execute: async (oldEmoji: GuildEmoji, newEmoji: GuildEmoji) => {
        const logChannel = oldEmoji.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        if (oldEmoji.name === newEmoji.name) return;

        const embed = createEmbed(
            {
                color: Colors.WARNING,
                title: 'Emoji Name Changed',
                description: `**Before:** ${oldEmoji.name}\n**+After:** ${newEmoji.name}`,
                footer: { text: `Emoji ID: ${oldEmoji.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};
