import type Discord from 'discord.js';
import type { ModerationRoleGroup } from '../lib/moderationAccess';
import { createEmbed, EmbedColors } from '../lib/embed';

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
    /** Legacy Discord permissions. Prefer requiredRoleGroup for staff authority. */
    permissions?: Discord.PermissionsString[];
    requiredRoleGroup?: ModerationRoleGroup;
    /** Allow the guild owner to repair an unconfigured development workspace. */
    allowOwnerDuringBootstrap?: boolean;
    /** Return true to discard a sensitive command before permission checks or replies. */
    silentGuard?: (message: Discord.Message<true>) => boolean;
    execute: (message: Discord.Message<true>, args: string[]) => Promise<void>;
};

export const createErrorEmbed = (description: string) =>
    createEmbed({ color: EmbedColors.FAILURE, title: 'Error', description });
