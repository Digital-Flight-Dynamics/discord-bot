import { describe, expect, test } from 'bun:test';
import { validateAtcUrl } from '../src/config/validate';

describe('runtime URL validation', () => {
    test.each([undefined, '', 'not a url', 'https://atc.example.com'])('rejects unsafe ATC_URL %s', (value) => {
        expect(validateAtcUrl(value)).not.toBeNull();
    });

    test('accepts an HTTPS moderation portal URL', () => {
        expect(validateAtcUrl('https://atc.digitalflightdynamics.com')).toBeNull();
    });
});
