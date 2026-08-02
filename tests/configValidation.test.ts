import { describe, expect, test } from 'bun:test';
import dfdDiscord from '../src/config/dfd-discord';
import { validateAtcUrl, validateConfig } from '../src/config/validate';

describe('runtime URL validation', () => {
    test('rejects a missing ATC_URL', () => {
        const original = process.env.ATC_URL;
        delete process.env.ATC_URL;
        try {
            expect(validateAtcUrl()).not.toBeNull();
        } finally {
            if (original === undefined) delete process.env.ATC_URL;
            else process.env.ATC_URL = original;
        }
    });

    test.each(['', 'not a url', 'https://atc.example.com'])('rejects unsafe ATC_URL %s', (value) => {
        expect(validateAtcUrl(value)).not.toBeNull();
    });

    test('accepts an HTTPS moderation portal URL', () => {
        expect(validateAtcUrl('https://atc.digitalflightdynamics.com')).toBeNull();
    });
});

describe('role-group validation', () => {
    test('allows moderation to use the configured management and moderator role fallbacks', () => {
        const config = {
            ...dfdDiscord,
            roleGroups: { ...dfdDiscord.roleGroups, moderation: [] },
        };
        expect(validateConfig(config).invalidValues).not.toContain('roleGroups.moderation');
    });
});
