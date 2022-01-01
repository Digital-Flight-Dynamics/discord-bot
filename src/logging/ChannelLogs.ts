import { createLogEmbed } from './index';

export const startChannelLogs = (client) => {
    client.on('channelCreate', async (channel) => {
        if (channel.type === 'DM') return;

        const logChannel = channel.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed(
            '#00FF00',
            'Channel Created',
            `**Channel:** <#${channel.id}>\n**Name:** ${channel.name}\n**Topic:** ${channel.topic}\n**Type:** ${channel.type}`,
            `Channel ID: ${channel.id}`,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
    client.on('channelDelete', async (channel) => {
        if (channel.type === 'DM') return;

        const logChannel = channel.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed('#FF0000', 'Channel Deleted', `**Name:** ${channel.name}\n**Topic:** ${channel.topic}\n**Type:** ${channel.type}`, `Channel ID: ${channel.id}`);

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
    client.on('channelUpdate', async (oldChannel, newChannel) => {
        if (oldChannel.type === 'DM') return;
        if (oldChannel.name.includes('Member Count:')) return; // Ignore membercount channel name change

        const logChannel = oldChannel.guild.channels.cache.find((c) => c.name === 'logs');

        if (oldChannel.name !== newChannel.name) {
            const embed = createLogEmbed(
                '#FFAA00',
                'Channel Name Changed',
                `**Channel:** <#${oldChannel.id}>\n**Before:** ${oldChannel.name}\n**After:** ${newChannel.name}`,
                `Channel ID: ${oldChannel.id}`,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }

        if (oldChannel.type !== 'GUILD_TEXT') return;

        if (oldChannel.topic !== newChannel.topic) {
            const embed = createLogEmbed(
                '#FFAA00',
                'Channel Topic Changed',
                `**Channel:** <#${oldChannel.id}>\n**Before:** ${oldChannel.topic}\n**After:** ${newChannel.topic}`,
                `Channel ID: ${oldChannel.id}`,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }
    });
};
