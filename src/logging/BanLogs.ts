import { GuildBan } from 'discord.js';
import { createEmbed } from '../lib/embed';
import { Colors, LogDefinition, getLogChannel } from '.';

export const guildBanAdd: LogDefinition = {
    event: 'guildBanAdd',
    execute: async (ban: GuildBan) => {
        const logChannel = getLogChannel(ban);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.RED,
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
        const logChannel = getLogChannel(ban);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.GREEN,
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
