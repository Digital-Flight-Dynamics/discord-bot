import { GuildChannel } from 'discord.js';
import { createEmbed } from '../lib/embed';
import { Colors, LogDefinition, getLogChannel, snakeToNorm } from '.';

export const channelCreate: LogDefinition<[GuildChannel]> = {
    event: 'channelCreate',
    execute: async (channel) => {
        const logChannel = getLogChannel(channel);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.GREEN,
                title: 'Channel Created',
                description: `**Channel:** <#${channel.id}>\n
                                **Name:** ${channel.name}\n
                                ${channel.isText() ? `**Topic:** ${channel.topic || 'None'}\n` : ''}
                                **Type:** ${snakeToNorm(channel.type)}`,
                footer: { text: `Channel ID: ${channel.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const channelDelete: LogDefinition<[GuildChannel]> = {
    event: 'channelDelete',
    execute: async (channel) => {
        const logChannel = getLogChannel(channel);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.RED,
                title: 'Channel Deleted',
                description: `**Name:** ${channel.name}\n${channel.isText() ? `**Topic:** ${channel.topic || 'None'}\n` : ''}**Type:** ${snakeToNorm(channel.type)}`,
                footer: { text: `Channel ID: ${channel.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const channelUpdate: LogDefinition<[GuildChannel, GuildChannel]> = {
    event: 'channelUpdate',
    execute: async (oldChannel, newChannel) => {
        if (oldChannel.name.includes('Member Count:')) return; // Ignore membercount channel name change

        const logChannel = getLogChannel(oldChannel);
        if (!logChannel) return;

        if (oldChannel.name !== newChannel.name) {
            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Channel Name Changed',
                    description: `**Channel:** <#${oldChannel.id}>\n**Before:** ${oldChannel.name}\n**+After:** ${newChannel.name}`,
                    footer: { text: `Channel ID: ${oldChannel.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }

        if (!oldChannel.isText() || !newChannel.isText()) return;

        if (oldChannel.topic !== newChannel.topic) {
            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Channel Topic Changed',
                    description: `**Channel:** <#${oldChannel.id}>\n**Before:** ${oldChannel.topic}\n**+After:** ${newChannel.topic}`,
                    footer: { text: `Channel ID: ${oldChannel.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }

        if (oldChannel.type === 'GUILD_NEWS' || newChannel.type === 'GUILD_NEWS') return;

        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Channel Slowmode Updated',
                    description: `**Channel:** <#${oldChannel.id}>\n**Before:** ${oldChannel.rateLimitPerUser}s\n**+After:** ${newChannel.rateLimitPerUser}s`,
                    footer: { text: `Channel ID: ${oldChannel.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] });
        }
    },
};
