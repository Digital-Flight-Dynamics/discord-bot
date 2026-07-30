import { describe, expect, test } from 'bun:test';
import { parseAtcInternalEvent } from '../src/lib/atcEvents';

const validEvent = {
    id: 'event-1',
    type: 'appeal.submitted',
    occurredAt: '2026-07-30T10:00:00.000Z',
    guildId: '808790838163406848',
    actionId: 'A0701.26W-9E6B9F5A81D2C407',
    appealId: '40bb5ce8-33bf-4ddc-842e-7b69ff5f5270',
};

describe('ATC internal events', () => {
    test('accepts a valid appeal event', () => {
        expect(parseAtcInternalEvent(validEvent)).toEqual(validEvent);
    });

    test('requires an appeal id for appeal events', () => {
        expect(parseAtcInternalEvent({ ...validEvent, appealId: undefined })).toBeNull();
    });

    test('rejects unsupported event types and malformed guild ids', () => {
        expect(parseAtcInternalEvent({ ...validEvent, type: 'unknown.event' })).toBeNull();
        expect(parseAtcInternalEvent({ ...validEvent, guildId: '123' })).toBeNull();
    });

    test('accepts moderation action events without an appeal id', () => {
        const event = { ...validEvent, type: 'moderation.action.updated', appealId: undefined };
        expect(parseAtcInternalEvent(event)).toEqual(event);
    });
});
