import { Collection, GuildChannel, Message, Snowflake, TextChannel } from 'discord.js';
import { createEmbed } from '../lib/embed';
import { LogDefinition } from '.';
import { Channels, Colors } from '../constants';

const CHANNEL_BLACKLIST = [Channels.MANAGEMENT];

export const messageDelete: LogDefinition = {
    event: 'messageDelete',
    execute: async (message: Message) => {
        if (!message.author || message.channel.isDMBased()) return;

        if (CHANNEL_BLACKLIST.includes(message.channel.id as Channels)) return;

        const logChannel = message.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.ERROR,
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

export const messageDeleteBulk: LogDefinition = {
    event: 'messageDeleteBulk',
    execute: async (messages: Collection<Snowflake, Message>) => {
        const channel = messages.at(0).channel as GuildChannel;
        const logChannel = channel.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const desc = [];

        messages.forEach((message) => {
            desc.push(`[${message.author ? message.author.tag : 'unknown_user'}]: ${message.content}`);
        });

        const embed = createEmbed(
            {
                color: Colors.ERROR,
                title: `${messages.size} Messages purged in #${channel.name}`,
                description: desc.join('\n'),
                footer: { text: `Channel ID: ${channel.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const messageUpdate: LogDefinition = {
    event: 'messageUpdate',
    execute: async (oldMsg: Message, newMsg: Message) => {
        if (!oldMsg.author || oldMsg.author.bot || oldMsg.channel.isDMBased()) return;
        if (CHANNEL_BLACKLIST.includes(oldMsg.channel.id as Channels)) return;

        const logChannel = oldMsg.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.WARNING,
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
