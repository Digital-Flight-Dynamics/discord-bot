import type Discord from 'discord.js';
import { createEmbed } from '../lib/embed';

export enum CommandCategories {
    A350X = 'A350X',
    GENERAL = 'General',
    FUN = 'Fun',
    MODERATION = 'Moderation',
    SUPPORT = 'Support',
}

export type CommandDefinition = {
    names: string[];
    description: string;
    category: CommandCategories;
    permissions?: Discord.PermissionsString[];
    execute: (message: Discord.Message, args: Array<string>) => Promise<unknown>;
};

export const createErrorEmbed = (description: string) => createEmbed({ color: 0xff0000, title: 'Error', description });
