import { describe, expect, test } from 'bun:test';
import {
    BOOTSTRAP_CATEGORY_NAMES,
    CHANNEL_CATEGORY_BY_KEY,
    CHANNEL_CATEGORY_NAMES,
    CHANNEL_DISCORD_NAMES,
    CHANNEL_KEYS,
} from '../src/config/channelNames';
import { isDevSetupRuntimeAllowed } from '../src/config/devMode';

const PRODUCTION_GUILD_ID = '808790838163406848';
const allowedRuntime = {
    configName: 'dev',
    workspaceName: 'dev',
    nodeEnv: 'development',
    guildId: '123456789012345678',
    productionGuildId: PRODUCTION_GUILD_ID,
    productionConstantsFile: false,
};

describe('devchannels production guards', () => {
    test('allows an explicit dev workspace in a non-production guild', () => {
        expect(isDevSetupRuntimeAllowed(allowedRuntime)).toBe(true);
    });

    test.each([
        { configName: 'dfd-discord' },
        { workspaceName: 'dfd-discord' },
        { nodeEnv: 'production' },
        { nodeEnv: 'PRODUCTION' },
        { guildId: PRODUCTION_GUILD_ID },
        { productionConstantsFile: true },
    ])('fails closed when a production signal is present: %o', (override) => {
        expect(isDevSetupRuntimeAllowed({ ...allowedRuntime, ...override })).toBe(false);
    });
});

describe('devchannels bootstrap topology', () => {
    test('defines one unique Discord name for every channel key', () => {
        expect(CHANNEL_KEYS).toHaveLength(19);
        expect(new Set(CHANNEL_KEYS).size).toBe(CHANNEL_KEYS.length);
        expect(new Set(Object.values(CHANNEL_DISCORD_NAMES)).size).toBe(CHANNEL_KEYS.length);
    });

    test('assigns every channel to one of the bootstrap categories', () => {
        const knownCategories = new Set(BOOTSTRAP_CATEGORY_NAMES);

        expect(knownCategories).toEqual(
            new Set([
                CHANNEL_CATEGORY_NAMES.public,
                CHANNEL_CATEGORY_NAMES.community,
                CHANNEL_CATEGORY_NAMES.moderation,
            ]),
        );
        for (const key of CHANNEL_KEYS) {
            expect(knownCategories.has(CHANNEL_CATEGORY_BY_KEY[key])).toBe(true);
        }
    });

    test('keeps the member counter as the dedicated voice-channel key', () => {
        expect(CHANNEL_DISCORD_NAMES.memberCounter).toBe('member-count');
        expect(CHANNEL_CATEGORY_BY_KEY.memberCounter).toBe(CHANNEL_CATEGORY_NAMES.community);
    });
});
