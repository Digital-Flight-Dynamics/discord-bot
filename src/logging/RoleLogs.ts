import { createLogEmbed } from './index';

export const startRoleLogs = (client) => {
    client.on('roleCreate', async (role) => {
        const logChannel = role.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed(
            '#00FF00',
            'Role Created',
            `**Role:** <@&${role.id}>\n**Name:** ${role.name}\n**Color:** ${role.hexColor.toUpperCase()}\n**Mentionable:** ${role.mentionable}`,
            `Role ID: ${role.id}`,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
    client.on('roleDelete', async (role) => {
        const logChannel = role.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed(
            '#FF0000',
            'Role Deleted',
            `**Name:** ${role.name}\n**Color:** ${role.hexColor.toUpperCase()}\n**Mentionable:** ${role.mentionable}`,
            `Role ID: ${role.id}`,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    });
    client.on('roleUpdate', async (oldRole, newRole) => {
        const logChannel = oldRole.guild.channels.cache.find((c) => c.name === 'logs');

        if (oldRole.color !== newRole.color) {
            await logChannel
                .send({
                    embeds: [
                        createLogEmbed(
                            '#FFAA00',
                            'Role Color Updated',
                            `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.hexColor.toUpperCase()}\n**After:** ${newRole.hexColor.toUpperCase()}`,
                            `Role ID: ${oldRole.id}`,
                        ),
                    ],
                })
                .catch(console.error);
        }
        if (oldRole.name !== newRole.name) {
            await logChannel
                .send({
                    embeds: [createLogEmbed('#FFAA00', 'Role Name Updated', `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.name}\n**After:** ${newRole.name}`, `Role ID: ${oldRole.id}`)],
                })
                .catch(console.error);
        }
        if (oldRole.mentionable !== newRole.mentionable) {
            await logChannel
                .send({
                    embeds: [
                        createLogEmbed(
                            '#FFAA00',
                            'Role Mentionable Flag Updated',
                            `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.mentionable}\n**After:** ${newRole.mentionable}`,
                            `Role ID: ${oldRole.id}`,
                        ),
                    ],
                })
                .catch(console.error);
        }
        if (oldRole.position !== newRole.position) {
            await logChannel
                .send({
                    embeds: [
                        createLogEmbed(
                            '#FFAA00',
                            'Role Position Updated',
                            `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.position}\n**After:** ${newRole.position}`,
                            `Role ID: ${oldRole.id}`,
                        ),
                    ],
                })
                .catch(console.error);
        }
    });
};
