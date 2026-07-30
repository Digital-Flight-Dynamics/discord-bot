import { describe, expect, test } from 'bun:test';
import { parseDurationToMs } from '../src/lib/moderation';

describe('moderation durations', () => {
    test('parses normal compact durations', () => {
        expect(parseDurationToMs('2h')).toBe(7_200_000);
    });

    test.each(['999999999999999999999d', '1e309d', 'Infinity days', '11y'])('rejects unsafe duration %s', (value) => {
        expect(parseDurationToMs(value)).toBe(0);
    });
});
