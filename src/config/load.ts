import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { BotWorkspaceConfig } from './types';

// Ensure .env is available even when this module is imported before index.ts runs dotenv.
dotenv.config();

const CONFIG_DIR = __dirname;

/**
 * Resolve which workspace config module to load (without extension).
 *
 * Priority:
 *  1. CONSTANTS_FILE env (e.g. "dfd-discord", "dev", "dfd-discord.ts")
 *  2. `npm run dev` / `bun run dev` lifecycle → "dev"
 *  3. default → "dfd-discord"
 */
export function resolveConfigName(): string {
    const raw = process.env.CONSTANTS_FILE?.trim();
    if (raw) {
        return raw.replace(/\.(ts|js|mjs|cjs)$/i, '');
    }

    // npm and bun both set npm_lifecycle_event for script runs
    if (process.env.npm_lifecycle_event === 'dev') {
        return 'dev';
    }

    return 'dfd-discord';
}

function loadModule(name: string): BotWorkspaceConfig {
    // ts-node / compiled node both resolve relative requires from this file
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(`./${name}`) as { default?: BotWorkspaceConfig } & BotWorkspaceConfig;
    const config = (mod.default ?? mod) as BotWorkspaceConfig;
    if (!config || typeof config !== 'object' || !config.channels || !config.roles) {
        throw new Error(`Config "${name}" does not export a valid BotWorkspaceConfig (default export required)`);
    }
    return config;
}

/** Set when load falls back to an empty shell (bot still starts, soft-locked). */
export let configLoadError: string | null = null;

function emptyFallbackConfig(name: string): BotWorkspaceConfig {
    const zero = '000000000000000000';
    const channelKeys = [
        'announcements',
        'botMessages',
        'commands',
        'events',
        'faq',
        'info',
        'logs',
        'modLogs',
        'management',
        'memberArrivals',
        'memberCounter',
        'memberDepartures',
        'memberMedia',
        'memberResources',
        'progress',
        'qAndA',
        'roles',
        'suggestions',
    ] as const;

    const channels = {} as BotWorkspaceConfig['channels'];
    for (const k of channelKeys) channels[k] = zero;

    return {
        name: `${name}-fallback`,
        guildId: zero,
        prefix: '.',
        channels,
        roles: {
            management: zero,
            moderator: zero,
            developer: zero,
            contributor: zero,
            verifiedPilot: zero,
            providers: zero,
            contentCreator: zero,
            serverBooster: zero,
            announcements: zero,
            progress: zero,
            events: zero,
            member: zero,
        },
        roleGroups: { projectTeam: [], moderation: [], team: [], dfd: [] },
        emojis: { announcement: '📣', progress: '❕', events: '✈' },
        presence: { intervalMs: 60_000, statuses: [] },
    };
}

/**
 * Load workspace constants for this process.
 * On failure, returns an empty fallback config so the bot can still log in soft-locked.
 */
export function loadConfig(): BotWorkspaceConfig {
    const name = resolveConfigName();

    try {
        const config = loadModule(name);
        // Prefer the resolved filename if the module forgot to set name
        if (!config.name) config.name = name;
        console.log(`[config] Loaded workspace constants: ${config.name}`);
        configLoadError = null;
        return config;
    } catch (err) {
        const examplePath = path.join(CONFIG_DIR, 'dev.example.ts');
        const devPath = path.join(CONFIG_DIR, 'dev.ts');
        const exampleExists = fs.existsSync(examplePath);

        let message: string;
        if (name === 'dev' && !fs.existsSync(devPath)) {
            message = [
                'Missing src/config/dev.ts for local development.',
                exampleExists ? 'Copy the template: cp src/config/dev.example.ts src/config/dev.ts' : '',
                'Or run: CONSTANTS_FILE=dfd-discord npm run dev',
            ]
                .filter(Boolean)
                .join(' ');
        } else {
            message = err instanceof Error ? err.message : String(err);
        }

        configLoadError = message;
        console.error(`[config] Failed to load "${name}": ${message}`);
        console.error('[config] Using empty fallback constants — bot will soft-lock until fixed.');
        return emptyFallbackConfig(name);
    }
}

/** Singleton config for the process lifetime. */
export const config: BotWorkspaceConfig = loadConfig();
