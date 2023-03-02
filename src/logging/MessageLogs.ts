import { Collection, GuildChannel, Message, Snowflake } from 'discord.js';
import { createEmbed } from '../lib/embed';
import { Colors, LogDefinition, getLogChannel } from '.';

const CHANNEL_BLACKLIST = ['908006127118204939'];

export const messageDelete: LogDefinition<[Message]> = {
    event: 'messageDelete',
    execute: async (message) => {
        if (!message.author || message.channel.type === 'DM') return;

        if (CHANNEL_BLACKLIST.includes(message.channel.id)) return;

        const logChannel = getLogChannel(message);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.RED,
                title: `Message deleted in #${message.channel.name}`,
                description: `**Content:** ${message.content}`,
                footer: { text: `User ID: ${message.author.id}` },
                author: { name: message.author.tag, iconURL: message.author.avatarURL() },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const messageDeleteBulk: LogDefinition<[Collection<Snowflake, Message>]> = {
    event: 'messageDeleteBulk',
    execute: async (messages) => {
        const channel = messages.at(0).channel as GuildChannel;
        const logChannel = getLogChannel(channel);
        if (!logChannel) return;

        const desc = [];

        messages.forEach((message) => {
            desc.push(`[${message.author.tag}]: ${message.content}`);
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

export const messageUpdate: LogDefinition<[Message, Message]> = {
    event: 'messageUpdate',
    execute: async (oldMsg, newMsg) => {
        if (!oldMsg.author || oldMsg.author.bot || oldMsg.channel.type === 'DM') return;
        if (CHANNEL_BLACKLIST.includes(oldMsg.channel.id)) return;

        const logChannel = getLogChannel(oldMsg);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.ORANGE,
                title: `Message edited in #${oldMsg.channel.name}`,
                description: `**Before:** ${oldMsg.content}\n**+After:** ${newMsg.content}`,
                footer: { text: `User ID: ${oldMsg.author.id}` },
                author: { name: oldMsg.author.tag, iconURL: oldMsg.author.avatarURL() },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};
