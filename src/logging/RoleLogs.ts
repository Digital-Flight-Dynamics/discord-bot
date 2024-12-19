import { createEmbed } from '../lib/embed';
import { LogDefinition, snakeToNorm } from '.';
import { Role, TextChannel } from 'discord.js';
import { Channels, Colors } from '../constants';

export const roleCreate: LogDefinition = {
    event: 'roleCreate',
    execute: async (role: Role) => {
        const logChannel = role.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.SUCCESS,
                title: 'Role Created',
                description: `**Role:** <@&${role.id}>\n**Name:** ${role.name}\n**Color:** ${role.hexColor.toUpperCase()}\n**Mentionable:** ${
                    role.mentionable
                }`,
                footer: { text: `Role ID: ${role.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const roleDelete: LogDefinition = {
    event: 'roleDelete',
    execute: async (role: Role) => {
        const logChannel = role.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        const embed = createEmbed(
            {
                color: Colors.ERROR,
                title: 'Role Deleted',
                description: `**Name:** ${role.name}\n**Color:** ${role.hexColor.toUpperCase()}\n**Mentionable:** ${role.mentionable}`,
                footer: { text: `Role ID: ${role.id}` },
            },
            true,
        );

        await logChannel.send({ embeds: [embed] }).catch(console.error);
    },
};

export const roleUpdate: LogDefinition = {
    event: 'roleUpdate',
    execute: async (oldRole: Role, newRole: Role) => {
        const logChannel = oldRole.guild.channels.cache.get(Channels.LOGS) as TextChannel;
        if (!logChannel) return;

        if (oldRole.color !== newRole.color) {
            const embed = createEmbed(
                {
                    color: Colors.WARNING,
                    title: 'Role Color Updated',
                    description: `**Role:** <@&${
                        oldRole.id
                    }>\n**Before:** ${oldRole.hexColor.toUpperCase()}\n**+After:** ${newRole.hexColor.toUpperCase()}`,
                    footer: { text: `Role ID: ${oldRole.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }
        if (oldRole.name !== newRole.name) {
            const embed = createEmbed(
                {
                    color: Colors.WARNING,
                    title: 'Role Name Updated',
                    description: `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.name}\n**+After:** ${newRole.name}`,
                    footer: { text: `Role ID: ${oldRole.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        }
        if (oldRole.mentionable !== newRole.mentionable) {
            const embed = createEmbed(
                {
                    color: Colors.WARNING,
                    title: 'Role Mentionable Flag Updated',
                    description: `**Role:** <@&${oldRole.id}>\n**Before:** ${oldRole.mentionable}\n**+After:** ${newRole.mentionable}`,
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
                    color: Colors.WARNING,
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
                    color: Colors.WARNING,
                    title: 'Role Permission Updated',
                    description: `**Role:** <@&${oldRole.id}>\n**Added:** ${snakeToNorm(perm)}`,
                    footer: { text: `Role ID: ${oldRole.id}` },
                },
                true,
            );

            await logChannel.send({ embeds: [embed] }).catch(console.error);
        });
    },
};
