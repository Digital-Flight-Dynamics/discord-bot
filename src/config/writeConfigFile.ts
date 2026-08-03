import fs from 'fs';
import path from 'path';
import { resolveConfigName } from './load';
import { CHANNEL_KEYS, type ChannelKey } from './channelNames';
import type { BotWorkspaceConfig } from './types';

const PLACEHOLDER_ID = '000000000000000000';
type RoleKey = keyof BotWorkspaceConfig['roles'];

/** Absolute path to the active workspace constants TypeScript source file. */
export function getActiveConfigSourcePath(): string {
    const name = resolveConfigName();
    return path.join(process.cwd(), 'src', 'config', `${name}.ts`);
}

function replaceKeyId(src: string, key: string, id: string): { src: string; ok: boolean } {
    const re = new RegExp(`(${key}\\s*:\\s*)(['"])([^'"]*)\\2`);
    if (!re.test(src)) {
        return { src, ok: false };
    }
    return { src: src.replace(re, `$1$2${id}$2`), ok: true };
}

/**
 * Patch channel IDs (and optional guildId) in the active constants source file.
 * Expects simple `key: 'snowflake'` entries like in dev.example.ts / dfd-discord.ts.
 */
export function writeChannelIdsToConfigFile(
    channelUpdates: Partial<Record<ChannelKey, string>>,
    guildId?: string,
): { path: string; updatedKeys: string[] } {
    const filePath = getActiveConfigSourcePath();
    if (!fs.existsSync(filePath)) {
        throw new Error(`Config source not found: ${filePath}`);
    }

    let src = fs.readFileSync(filePath, 'utf8');
    const updatedKeys: string[] = [];

    for (const [key, id] of Object.entries(channelUpdates)) {
        if (!id) continue;
        const result = replaceKeyId(src, key, id);
        if (!result.ok) {
            console.warn(`[config] Could not find key "${key}" in ${filePath}`);
            continue;
        }
        src = result.src;
        updatedKeys.push(key);
    }

    if (guildId) {
        const result = replaceKeyId(src, 'guildId', guildId);
        if (result.ok) {
            src = result.src;
            updatedKeys.push('guildId');
        }
    }

    fs.writeFileSync(filePath, src, 'utf8');
    return { path: filePath, updatedKeys };
}

export function writeRoleIdsToConfigFile(
    roleUpdates: Partial<Record<RoleKey, string>>,
): { path: string; updatedKeys: string[] } {
    const filePath = getActiveConfigSourcePath();
    if (!fs.existsSync(filePath)) {
        throw new Error(`Config source not found: ${filePath}`);
    }

    let src = fs.readFileSync(filePath, 'utf8');
    const updatedKeys: string[] = [];
    const rolesBlock = /(roles\s*:\s*\{)([\s\S]*?)(\n\s*\},\n\n\s*roleGroups\s*:)/m.exec(src);
    if (!rolesBlock) {
        throw new Error(`Could not find roles block in ${filePath}`);
    }

    let roleBody = rolesBlock[2];
    for (const [key, id] of Object.entries(roleUpdates)) {
        if (!id) continue;
        const result = replaceKeyId(roleBody, key, id);
        if (!result.ok) {
            console.warn(`[config] Could not find role key "${key}" in ${filePath}`);
            continue;
        }
        roleBody = result.src;
        updatedKeys.push(key);
    }

    src = src.replace(rolesBlock[0], `${rolesBlock[1]}${roleBody}${rolesBlock[3]}`);
    fs.writeFileSync(filePath, src, 'utf8');
    return { path: filePath, updatedKeys };
}

/**
 * Reset all channel snowflakes (and guildId) in the active constants file to placeholders.
 * Used by `.devchannels cleanup`.
 */
export function clearChannelIdsInConfigFile(): { path: string; clearedKeys: string[] } {
    const filePath = getActiveConfigSourcePath();
    if (!fs.existsSync(filePath)) {
        throw new Error(`Config source not found: ${filePath}`);
    }

    let src = fs.readFileSync(filePath, 'utf8');
    const clearedKeys: string[] = [];

    for (const key of CHANNEL_KEYS) {
        const result = replaceKeyId(src, key, PLACEHOLDER_ID);
        if (result.ok) {
            src = result.src;
            clearedKeys.push(key);
        }
    }

    const guildResult = replaceKeyId(src, 'guildId', PLACEHOLDER_ID);
    if (guildResult.ok) {
        src = guildResult.src;
        clearedKeys.push('guildId');
    }

    fs.writeFileSync(filePath, src, 'utf8');
    return { path: filePath, clearedKeys };
}

export { PLACEHOLDER_ID };
