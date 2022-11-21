import { createEmbed } from '../lib/embed';
import { Colors, LogDefinition, getLogChannel } from '.';
import { Role, PermissionResolvable } from 'discord.js';

export const roleCreate: LogDefinition<[Role]> = {
    event: 'roleCreate',
    execute: async (role) => {
        const logChannel = getLogChannel(role);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.GREEN,
                title: 'Role Created',
                description: `**Role:** <@&${role.id}>\n**Name:** ${role.name}\n**Color:** ${role.hexColor.toUpperCase()}\n**Mentionable:** ${role.mentionable}`,
                footer: { text: `Role ID: ${role.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const roleDelete: LogDefinition<[Role]> = {
    event: 'roleDelete',
    execute: async (role) => {
        const logChannel = getLogChannel(role);
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.RED,
                title: 'Role Deleted',
                description: `**Name:** ${role.name}\n**Color:** ${role.hexColor.toUpperCase()}\n**Mentionable:** ${role.mentionable}`,
                footer: { text: `Role ID: ${role.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const roleUpdate: LogDefinition<[Role, Role]> = {
    event: 'roleUpdate',
    execute: async (oldRole, newRole) => {
        const logChannel = getLogChannel(oldRole);
        if (!logChannel) return;

        const snakeToNorm = (str: string) => {
            return str
                .toLowerCase()
                .split('_')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        };

        if (oldRole.color !== newRole.color) {
            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Role Color Updated',
                    description: `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.hexColor.toUpperCase()}\n**After:** ${newRole.hexColor.toUpperCase()}`,
                    footer: { text: `Role ID: ${oldRole.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }
        if (oldRole.name !== newRole.name) {
            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Role Name Updated',
                    description: `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.name}\n**After:** ${newRole.name}`,
                    footer: { text: `Role ID: ${oldRole.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }
        if (oldRole.mentionable !== newRole.mentionable) {
            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Role Mentionable Flag Updated',
                    description: `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.mentionable}\n**After:** ${newRole.mentionable}`,
                    footer: { text: `Role ID: ${oldRole.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }
        oldRole.permissions.toArray().forEach(async (perm) => {
            if (newRole.permissions.has(perm)) return;

            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Role Permission Updated',
                    description: `**Role:** <@&${oldRole.id}>\n**Removed:** ${snakeToNorm(perm)}`,
                    footer: { text: `Role ID: ${oldRole.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        });
        newRole.permissions.toArray().forEach(async (perm) => {
            if (oldRole.permissions.has(perm)) return;

            const embed = createEmbed(
                {
                    color: Colors.ORANGE,
                    title: 'Role Permission Updated',
                    description: `**Role:** <@&${oldRole.id}>\n**Added:** ${snakeToNorm(perm)}`,
                    footer: { text: `Role ID: ${oldRole.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        });
        console.log(oldRole.permissions.equals(newRole.permissions));
    },
};
