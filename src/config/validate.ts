import type { BotWorkspaceConfig } from './types';
import { CHANNEL_KEYS, isUnsetSnowflake } from './channelNames';
import { logMissingRequiredChannel } from './errors';

/**
 * True when workspace constants look empty / unbootstrapped
 * (almost all channel snowflakes still placeholders).
 */
export function isConfigEmpty(cfg: BotWorkspaceConfig): boolean {
    const unset = CHANNEL_KEYS.filter((k) => isUnsetSnowflake(cfg.channels[k]));
    // Fully empty, or nearly empty bootstrap template
    return unset.length >= Math.max(1, CHANNEL_KEYS.length - 1);
}

export type ConfigValidation = {
    missingChannels: string[];
    missingModerationCapabilities: string[];
    invalidValues: string[];
    isEmpty: boolean;
};

/** One deterministic view of startup configuration health. */
export function validateConfig(cfg: BotWorkspaceConfig): ConfigValidation {
    const missingChannels = listUnsetChannelConstants(cfg);
    return {
        missingChannels,
        missingModerationCapabilities: listMissingModerationCapabilities(cfg),
        invalidValues: listInvalidConfigValues(cfg),
        isEmpty: missingChannels.length >= Math.max(1, CHANNEL_KEYS.length - 1),
    };
}

function listInvalidConfigValues(cfg: BotWorkspaceConfig): string[] {
    const invalid: string[] = [];
    if (!isDiscordSnowflake(cfg.guildId)) invalid.push('guildId');
    if (!cfg.prefix?.trim()) invalid.push('prefix');
    for (const role of ['management', 'moderator', 'developer', 'member'] as const) {
        if (!isDiscordSnowflake(cfg.roles[role])) invalid.push(`roles.${role}`);
    }
    if (cfg.roleGroups.moderation.length === 0 || cfg.roleGroups.moderation.some((id) => !isDiscordSnowflake(id))) {
        invalid.push('roleGroups.moderation');
    }
    for (const key of CHANNEL_KEYS) {
        const id = cfg.channels[key];
        if (!isUnsetSnowflake(id) && !isDiscordSnowflake(id)) invalid.push(`channels.${key}`);
    }
    if (cfg.presence?.intervalMs !== undefined && (!Number.isFinite(cfg.presence.intervalMs) || cfg.presence.intervalMs < 10_000)) {
        invalid.push('presence.intervalMs');
    }
    const healthPort = Number(process.env.HEALTH_PORT || 3000);
    if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65_535) invalid.push('HEALTH_PORT');
    return invalid;
}

function isDiscordSnowflake(value: string | undefined): boolean {
    return Boolean(value && /^\d{17,20}$/.test(value) && !/^0+$/.test(value));
}

export function validateAtcUrl(value = process.env.ATC_URL): string | null {
    if (!value) return 'ATC_URL is missing';
    if (value.length > 500) return 'ATC_URL is too long';
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.hostname === 'atc.example.com') {
            return 'ATC_URL is invalid or still a placeholder';
        }
        return null;
    } catch {
        return 'ATC_URL is invalid';
    }
}

/** The honeypot must exist for its destructive automated moderation workflow. */
export function listMissingModerationCapabilities(cfg: BotWorkspaceConfig): string[] {
    return ['honeypot']
        .filter((key) => isUnsetSnowflake(cfg.channels[key as keyof BotWorkspaceConfig['channels']]))
        .map((key) => `channels.${key}`);
}

/** Unset channel constant paths, e.g. `channels.logs`. */
export function listUnsetChannelConstants(cfg: BotWorkspaceConfig): string[] {
    return CHANNEL_KEYS.filter((k) => isUnsetSnowflake(cfg.channels[k])).map((k) => `channels.${k}`);
}

/**
 * Log one [ERROR] line per missing channel constant (standard soft-lock message).
 * Returns the list of missing paths.
 */
export function logUnsetChannelConstants(cfg: BotWorkspaceConfig): string[] {
    const missing = listUnsetChannelConstants(cfg);
    for (const path of missing) {
        logMissingRequiredChannel(path);
    }
    return missing;
}

export function describeConfigGaps(cfg: BotWorkspaceConfig): string {
    const unset = listUnsetChannelConstants(cfg);
    if (unset.length === 0) return '';
    if (unset.length === CHANNEL_KEYS.length) {
        return 'All channel constants unset';
    }
    return `${unset.length} channel constant(s) unset`;
}
