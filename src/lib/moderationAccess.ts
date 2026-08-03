import type { GuildMember } from 'discord.js';
import { roleGroups, roles } from '../config';

export type ModerationRoleGroup = 'moderation' | 'developer';

/**
 * Moderation authority is intentionally granted by configured roles, not Discord
 * permission flags. Discord permissions only control what the bot itself can do.
 */
export function hasRoleAccess(member: GuildMember | null, group: ModerationRoleGroup): boolean {
    if (!member) return false;
    const configured =
        group === 'moderation'
            ? [...roleGroups.moderation, roles.management, roles.moderator]
            : [roles.developer, roles.management];
    return member.roles.cache.some((role) => configured.includes(role.id));
}
