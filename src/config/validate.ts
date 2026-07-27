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
