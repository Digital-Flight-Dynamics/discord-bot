import { createLogEmbed } from './index';

export const startModLogs = (client) => {
    client.on('guildBanAdd', async (ban) => {
        const logChannel = ban.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed('#FF0000', 'User Banned', `**User:** ${ban.user.tag}\n**Reason:** ${ban.reason}`, `User ID: ${ban.user.id}`);

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
    client.on('guildBanRemove', async (ban) => {
        const logChannel = ban.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed('#FF0000', 'User Unbanned', `**User:** ${ban.user.tag}\n**Reason:** ${ban.reason}`, `User ID: ${ban.user.id}`);

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
};
