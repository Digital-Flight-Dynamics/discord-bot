import { describe, expect, test } from 'bun:test';
import { ACTION_ID_RE, buildActionIdCandidate, normalizeActionId } from '../src/lib/actionId';

describe('moderation action IDs', () => {
    test('builds the documented public format', () => {
        const actionId = buildActionIdCandidate(
            'warning',
            new Date('2026-01-07T12:00:00Z'),
            270,
        );

        expect(actionId).toBe('A0701.26W90-X');
        expect(actionId).toMatch(ACTION_ID_RE);
    });

    test.each([
        // IDs generated during the temporary long-ID period remain readable.
        ['A0701.26W-9E6B9F5A81D2C407', 'A0701.26W-9E6B9F5A81D2C407'],
        ['070126W9E6B9F5A81D2C407', 'A0701.26W-9E6B9F5A81D2C407'],
        ['070126W42X', 'A0701.26W42-X'],
    ])('normalizes %s', (input, expected) => {
        expect(normalizeActionId(input)).toBe(expected);
    });
});
