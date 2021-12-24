import { createLogEmbed } from './index';

export const startRoleLogs = (client) => {
    client.on('roleCreate', async (role) => {
        const logChannel = role.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed(
            '#00FF00',
            'Role Created',
            `Name: "${role.name}"\nColor: ${role.hexColor.toUpperCase()}\nMentionable: ${role.mentionable}`,
            `Role ID: ${role.id}`,
        );

        await logChannel.send({ embeds: [embed] });
    });
    client.on('roleDelete', async (role) => {
        const logChannel = role.guild.channels.cache.find((c) => c.name === 'logs');

        const embed = createLogEmbed(
            '#FF0000',
            'Role Deleted',
            `Name: "${role.name}"\nColor: ${role.hexColor.toUpperCase()}\nMentionable: ${role.mentionable}`,
            `Role ID: ${role.id}`,
        );

        await logChannel.send({ embeds: [embed] });
    });
    client.on('roleUpdate', async (oldRole, newRole) => {
        const logChannel = oldRole.guild.channels.cache.find((c) => c.name === 'logs');

        if (oldRole.color !== newRole.color) {
            await logChannel.send({
                embeds: [
                    createLogEmbed(
                        '#FFAA00',
                        'Role Color Updated',
                        `**Role:** ${
                            oldRole.name
                        }\n**Before:** ${oldRole.hexColor.toUpperCase()}\n**After:** ${newRole.hexColor.toUpperCase()}`,
                        `Role ID: ${oldRole.id}`,
                    ),
                ],
            });
        }
        if (oldRole.name !== newRole.name) {
            await logChannel.send({
                embeds: [
                    createLogEmbed(
                        '#FFAA00',
                        'Role Name Updated',
                        `**Before:** "${oldRole.name}"\n**After:** "${newRole.name}"`,
                        `Role ID: ${oldRole.id}`,
                    ),
                ],
            });
        }
        if (oldRole.mentionable !== newRole.mentionable) {
            await logChannel.send({
                embeds: [
                    createLogEmbed(
                        '#FFAA00',
                        'Role Mentionable Flag Updated',
                        `**Role:** ${oldRole.name}\n**Before:** ${oldRole.mentionable}\n**After:** ${newRole.mentionable}`,
                        `Role ID: ${oldRole.id}`,
                    ),
                ],
            });
        }
        if (oldRole.position !== newRole.position) {
            await logChannel.send({
                embeds: [
                    createLogEmbed(
                        '#FFAA00',
                        'Role Position Updated',
                        `**Role:** ${oldRole.name}\n**Before:** ${oldRole.position}\n**After:** ${newRole.position}`,
                        `Role ID: ${oldRole.id}`,
                    ),
                ],
            });
        }
    });
};
