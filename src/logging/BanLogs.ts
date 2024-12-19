import { GuildBan, TextChannel } from 'discord.js';
import { createEmbed } from '../lib/embed';
import { LogDefinition } from '.';
import { Channels, Colors } from '../constants';

export const guildBanAdd: LogDefinition = {
    event: 'guildBanAdd',
    execute: async (ban: GuildBan) => {
        const logChannel = ban.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.ERROR,
                title: 'User Banned',
                description: `**Reason:** ${ban.reason}`,
                footer: { text: `User ID: ${ban.user.id}` },
                author: { name: ban.user.tag, iconURL: ban.user.avatarURL() },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const guildBanRemove: LogDefinition = {
    event: 'guildBanRemove',
    execute: async (ban: GuildBan) => {
        const logChannel = ban.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.SUCCESS,
                title: 'User Unbanned',
                description: `**Reason:** ${ban.reason}`,
                footer: { text: `User ID: ${ban.user.id}` },
                author: { name: ban.user.tag, iconURL: ban.user.avatarURL() },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};
