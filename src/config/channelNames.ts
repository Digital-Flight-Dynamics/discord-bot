import type { BotWorkspaceConfig } from './types';

export type ChannelKey = keyof BotWorkspaceConfig['channels'];

/**
 * Discord channel names (1-1) for each config.channels key.
 * Used by .devchannels create for name matching + creation.
 */
export const CHANNEL_DISCORD_NAMES: Record<ChannelKey, string> = {
    announcements: 'announcements',
    botMessages: 'bot-dms',
    commands: 'commands',
    events: 'events',
    faq: 'faq',
    info: 'info',
    logs: 'audit-logs',
    modLogs: 'mod-logs',
    management: 'management',
    memberArrivals: 'arrivals',
    // Created as this name; memberCounter util renames to "Member Count: N"
    memberCounter: 'member-count',
    memberDepartures: 'leaves',
    memberMedia: 'member-media',
    memberResources: 'member-resources',
    progress: 'progress',
    qAndA: 'q-and-a',
    roles: 'roles',
    suggestions: 'suggestions',
};

/**
 * Discord category names for `.devchannels create` layout only.
 * Not stored in workspace constants — cleanup deletes these like any other channel.
 */
export const CHANNEL_CATEGORY_NAMES = {
    public: 'Public Channels',
    community: 'Community',
    moderation: 'Moderation',
} as const;

export type ChannelCategoryName = (typeof CHANNEL_CATEGORY_NAMES)[keyof typeof CHANNEL_CATEGORY_NAMES];

/** Which category each channel key is created under. */
export const CHANNEL_CATEGORY_BY_KEY: Record<ChannelKey, ChannelCategoryName> = {
    announcements: CHANNEL_CATEGORY_NAMES.public,
    commands: CHANNEL_CATEGORY_NAMES.public,
    events: CHANNEL_CATEGORY_NAMES.public,
    faq: CHANNEL_CATEGORY_NAMES.public,
    info: CHANNEL_CATEGORY_NAMES.public,
    progress: CHANNEL_CATEGORY_NAMES.public,
    qAndA: CHANNEL_CATEGORY_NAMES.public,
    roles: CHANNEL_CATEGORY_NAMES.public,
    suggestions: CHANNEL_CATEGORY_NAMES.public,
    memberMedia: CHANNEL_CATEGORY_NAMES.public,
    memberResources: CHANNEL_CATEGORY_NAMES.public,

    memberArrivals: CHANNEL_CATEGORY_NAMES.community,
    memberDepartures: CHANNEL_CATEGORY_NAMES.community,
    memberCounter: CHANNEL_CATEGORY_NAMES.community,

    logs: CHANNEL_CATEGORY_NAMES.moderation,
    modLogs: CHANNEL_CATEGORY_NAMES.moderation,
    management: CHANNEL_CATEGORY_NAMES.moderation,
    botMessages: CHANNEL_CATEGORY_NAMES.moderation,
};

/** All bootstrap category names (for ensure + cleanup awareness). */
export const BOOTSTRAP_CATEGORY_NAMES: ChannelCategoryName[] = [
    CHANNEL_CATEGORY_NAMES.public,
    CHANNEL_CATEGORY_NAMES.community,
    CHANNEL_CATEGORY_NAMES.moderation,
];

export const CHANNEL_KEYS = Object.keys(CHANNEL_DISCORD_NAMES) as ChannelKey[];

/** Placeholder / empty IDs that mean "not configured yet". */
export function isUnsetSnowflake(id: string | undefined | null): boolean {
    if (id == null) return true;
    const s = String(id).trim();
    if (!s) return true;
    if (/^0+$/.test(s)) return true;
    return false;
}
