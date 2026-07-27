export type { BotWorkspaceConfig } from './types';
export { config, loadConfig, resolveConfigName, configLoadError } from './load';
export { isDevelopmentMode, isProductionConstantsFile } from './devMode';
export { CHANNEL_DISCORD_NAMES, CHANNEL_KEYS, isUnsetSnowflake } from './channelNames';
export type { ChannelKey } from './channelNames';
export { isConfigEmpty, describeConfigGaps, listUnsetChannelConstants, logUnsetChannelConstants } from './validate';
export { CONFIG_DOCS, logMissingRequiredChannel, logMissingRequiredConfig } from './errors';

import { config } from './load';

/** Convenience re-exports so callers can `import { channels, roles, prefix } from '../config'`. */
export const prefix = config.prefix;
export const channels = config.channels;
export const roles = config.roles;
export const roleGroups = config.roleGroups;
export const emojis = config.emojis;
export const guildId = config.guildId;
