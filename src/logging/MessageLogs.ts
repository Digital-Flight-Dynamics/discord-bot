import { createEmbed } from '../lib/embed';
import { Colors, LogDefinition, getLogChannel } from '.';
import { channels } from '../config';

const CHANNEL_BLACKLIST = [channels.management];

export const messageDelete: LogDefinition<'messageDelete'> = {
    event: 'messageDelete',
    execute: async (message) => {
        if (!message.author || message.channel.isDMBased()) return;

        if (CHANNEL_BLACKLIST.includes(message.channel.id)) return;

        const logChannel = getLogChannel(message);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.RED,
                title: `Message deleted in #${message.channel.name}`,
                description: `**Content:** ${message.content}`,
                footer: { text: `User ID: ${message.author.id}` },
                author: { name: message.author.tag, iconURL: message.author.avatarURL() || undefined },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const messageDeleteBulk: LogDefinition<'messageDeleteBulk'> = {
    event: 'messageDeleteBulk',
    execute: async (messages, channel) => {
        const first = messages.at(0);
        if (!first) return;
        const logChannel = getLogChannel(channel);
        if (!logChannel) return;

        const desc: string[] = [];

        messages.forEach((message) => {
            desc.push(`[${message.author ? message.author.tag : 'unknown_user'}]: ${message.content}`);
        });

        const embed = createEmbed(
            {
                color: Colors.RED,
                title: `${messages.size} Messages purged in #${channel.name}`,
                description: desc.join('\n'),
                footer: { text: `Channel ID: ${channel.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const messageUpdate: LogDefinition<'messageUpdate'> = {
    event: 'messageUpdate',
    execute: async (oldMsg, newMsg) => {
        if (!oldMsg.author || oldMsg.author.bot || oldMsg.channel.isDMBased()) return;
        if (CHANNEL_BLACKLIST.includes(oldMsg.channel.id)) return;

        const logChannel = getLogChannel(oldMsg);
        if (!logChannel) return;

        // Embed-only updates do not need a text-content audit entry.
        if (oldMsg.content === newMsg.content) return;

        const embed = createEmbed(
            {
                color: Colors.ORANGE,
                title: `Message edited in #${oldMsg.channel.name}`,
                description: `**Before:** ${oldMsg.content}\n**+After:** ${newMsg.content}`,
                footer: { text: `User ID: ${oldMsg.author.id}` },
                author: { name: oldMsg.author.tag, iconURL: oldMsg.author.avatarURL() || undefined },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};
