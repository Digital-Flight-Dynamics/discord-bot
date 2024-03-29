import { ChannelType, GuildChannel, TextChannel } from 'discord.js';
import { createEmbed } from '../lib/embed';
import { Colors, LogDefinition, getLogChannel } from '.';

export const channelCreate: LogDefinition = {
    event: 'channelCreate',
    execute: async (channel: GuildChannel) => {
        const logChannel = getLogChannel(channel);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.GREEN,
                title: 'Channel Created',
                description: `**Channel:** <#${channel.id}>\n**Name:** ${channel.name}\n${
                    channel.isTextBased() ? `**Topic:** ${(channel as TextChannel).topic || 'None'}` : ''
                }`,
                footer: { text: `Channel ID: ${channel.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const channelDelete: LogDefinition = {
    event: 'channelDelete',
    execute: async (channel: GuildChannel) => {
        const logChannel = getLogChannel(channel);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.RED,
                title: 'Channel Deleted',
                description: `**Name:** ${channel.name}\n${channel.isTextBased() ? `**Topic:** ${(channel as TextChannel).topic || 'None'}\n` : ''}`,
                footer: { text: `Channel ID: ${channel.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const channelUpdate: LogDefinition = {
    event: 'channelUpdate',
    execute: async (oldChannel: GuildChannel, newChannel: GuildChannel) => {
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

        if (!oldChannel.isTextBased() || !newChannel.isTextBased()) return;

        if ((oldChannel as TextChannel).topic !== (newChannel as TextChannel).topic) {
            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Channel Topic Changed',
                    description: `**Channel:** <#${oldChannel.id}>\n**Before:** ${(oldChannel as TextChannel).topic}\n**+After:** ${
                        (newChannel as TextChannel).topic
                    }`,
                    footer: { text: `Channel ID: ${oldChannel.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }

        if (oldChannel.type === ChannelType.GuildAnnouncement || newChannel.type === ChannelType.GuildAnnouncement) return;

        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Channel Slowmode Updated',
                    description:
                        `**Channel:** <#${oldChannel.id}>\n**Before:** ${oldChannel.rateLimitPerUser}s\n` +
                        `**+After:** ${newChannel.rateLimitPerUser}s`,
                    footer: { text: `Channel ID: ${oldChannel.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] });
        }
    },
};
