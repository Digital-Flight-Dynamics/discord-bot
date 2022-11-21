import { createEmbed } from '../lib/embed';
import { Colors, LogDefinition, getLogChannel } from '.';
import { GuildBan } from 'discord.js';

export const guildBanAdd: LogDefinition<[GuildBan]> = {
    event: 'guildBanAdd',
    execute: async (ban) => {
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

export const guildBanRemove: LogDefinition<[GuildBan]> = {
    event: 'guildBanRemove',
    execute: async (ban) => {
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
